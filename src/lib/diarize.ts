/**
 * Speaker diarization in the browser.
 *
 * pyannote/segmentation-3.0 only sees 10 seconds at a time and its speaker
 * labels are local to each window, so running it once over a 40-minute file
 * (as the reference demos do) relabels the same person every few seconds. This
 * module instead slides the model across the recording, embeds each local
 * speaker turn with WeSpeaker, and clusters the embeddings globally, which is
 * what keeps "Speaker 1" the same person from beginning to end.
 */

import { AutoModel, AutoModelForAudioFrameClassification, AutoProcessor } from '@huggingface/transformers'
import { agglomerativeCluster, normalise } from './cluster.ts'
import { EMBEDDING_MODEL, SEGMENTATION_MODEL } from './models.ts'
import {
  absorbTinySpeakers,
  activityToIntervals,
  clipIntervals,
  decodePowerset,
  dropShortTurns,
  flattenTurns,
  mergeTurns,
  renumberSpeakers,
  type Interval,
} from './segments.ts'
import type { Backend, SpeakerTurn } from './types.ts'

export const SAMPLE_RATE = 16000

/** The window pyannote/segmentation-3.0 was trained on. */
export const WINDOW_S = 10
/** Half-overlap, so every moment is covered by two windows. */
export const HOP_S = 5

/** Cosine-distance threshold for merging two speakers, tuned on real speech. */
export const DEFAULT_CLUSTER_THRESHOLD = 0.62

/** Shortest turn worth embedding. Below this the embedding is mostly noise. */
const MIN_EMBED_S = 0.7

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = any

interface DiarizerBundle {
  segProcessor: AnyModel
  segModel: AnyModel
  embProcessor: AnyModel
  embModel: AnyModel
}

let bundle: Promise<DiarizerBundle> | null = null

export async function loadDiarizer(
  backend: Backend,
  onProgress?: (p: unknown) => void,
): Promise<DiarizerBundle> {
  // These two are small and run on CPU: ONNX Runtime's WebGPU backend does not
  // cover the ops pyannote's SincNet front end uses.
  const device = backend === 'webgpu' ? 'wasm' : backend
  bundle ??= (async () => {
    const [segProcessor, segModel, embProcessor, embModel] = await Promise.all([
      AutoProcessor.from_pretrained(SEGMENTATION_MODEL.id, { progress_callback: onProgress }),
      AutoModelForAudioFrameClassification.from_pretrained(SEGMENTATION_MODEL.id, {
        device,
        dtype: 'fp32',
        progress_callback: onProgress,
      }),
      AutoProcessor.from_pretrained(EMBEDDING_MODEL.id, { progress_callback: onProgress }),
      AutoModel.from_pretrained(EMBEDDING_MODEL.id, {
        device,
        dtype: 'fp32',
        progress_callback: onProgress,
      }),
    ])
    return { segProcessor, segModel, embProcessor, embModel }
  })()
  return bundle
}

export function resetDiarizer(): void {
  bundle = null
}

/** Concatenates only the samples where this speaker is actually talking. */
function gatherSpeech(audio: Float32Array, intervals: Interval[]): Float32Array {
  let total = 0
  const ranges = intervals.map((iv) => {
    const from = Math.max(0, Math.floor(iv.start * SAMPLE_RATE))
    const to = Math.min(audio.length, Math.ceil(iv.end * SAMPLE_RATE))
    total += Math.max(0, to - from)
    return [from, to] as const
  })
  const out = new Float32Array(total)
  let cursor = 0
  for (const [from, to] of ranges) {
    if (to <= from) continue
    out.set(audio.subarray(from, to), cursor)
    cursor += to - from
  }
  return out
}

/** Pulls the first tensor out of a model output regardless of its export name. */
function firstTensor(output: Record<string, AnyModel>): AnyModel {
  return output.logits ?? output.last_hidden_state ?? output.embeddings ?? Object.values(output)[0]
}

/** One local speaker's activity inside one analysis window. */
interface LocalTurn {
  /** Intervals in recording time, already cropped to the window's centre. */
  intervals: Interval[]
  /**
   * Every interval this speaker holds inside the window. The embedding is taken
   * over these joined together: using the span from first to last would splice
   * in whatever the other speaker said in between and blur the two voices into
   * one, which collapses the clustering to a single speaker.
   */
  speech: Interval[]
}

export interface DiarizeOptions {
  clusterThreshold?: number
  numSpeakers?: number
  maxSpeakers?: number
  onProgress?: (ratio: number) => void
  signal?: AbortSignal
}

export interface DiarizeResult {
  turns: SpeakerTurn[]
  speakerCount: number
}

export interface Analysis {
  localTurns: LocalTurn[]
  embeddings: Float32Array[]
}

/**
 * Runs the two models over the recording: segmentation to find who is talking
 * when, embeddings to describe each voice. Clustering is deliberately left to
 * `assignSpeakers` so the threshold can be re-tuned without paying for this
 * again.
 */
export async function analyse(
  audio: Float32Array,
  backend: Backend,
  options: Pick<DiarizeOptions, 'onProgress' | 'signal'> = {},
): Promise<Analysis> {
  const { onProgress, signal } = options

  const { segProcessor, segModel, embProcessor, embModel } = await loadDiarizer(backend)

  const duration = audio.length / SAMPLE_RATE
  const windowSamples = WINDOW_S * SAMPLE_RATE
  const hopSamples = HOP_S * SAMPLE_RATE
  const starts: number[] = []
  for (let s = 0; s < audio.length; s += hopSamples) {
    starts.push(s)
    if (s + windowSamples >= audio.length) break
  }

  const localTurns: LocalTurn[] = []

  for (let w = 0; w < starts.length; w++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const from = starts[w]
    const to = Math.min(from + windowSamples, audio.length)
    const chunk = audio.subarray(from, to)
    if (chunk.length < SAMPLE_RATE) break

    const inputs = await segProcessor(chunk)
    const output = await segModel(inputs)
    const scores: number[][] = firstTensor(output).tolist()[0]
    const active = decodePowerset(scores)

    const windowStart = from / SAMPLE_RATE
    const windowEnd = to / SAMPLE_RATE
    const frameDuration = (windowEnd - windowStart) / active.length

    // Every moment sits in two windows. Keep only each window's centre so the
    // two never disagree, except at the very start and end of the recording.
    const cropFrom = w === 0 ? windowStart : windowStart + (WINDOW_S - HOP_S) / 2
    const cropTo =
      w === starts.length - 1 ? windowEnd : Math.min(windowEnd - (WINDOW_S - HOP_S) / 2, duration)

    for (let speaker = 0; speaker < 3; speaker++) {
      const mask = active.map((set) => set.includes(speaker))
      if (!mask.some(Boolean)) continue
      const all = activityToIntervals(mask, frameDuration, windowStart)
      const cropped = clipIntervals(all, cropFrom, cropTo)
      if (cropped.length === 0) continue
      const total = all.reduce((sum, iv) => sum + (iv.end - iv.start), 0)
      if (total < MIN_EMBED_S) continue
      localTurns.push({ intervals: cropped, speech: all })
    }

    onProgress?.(((w + 1) / starts.length) * 0.6)
  }

  if (localTurns.length === 0) return { localTurns, embeddings: [] }

  // Embed each local turn. The embedding uses the speaker's whole span inside
  // the window, not just the cropped centre, so it has more voice to work with.
  const embeddings: Float32Array[] = []
  for (let i = 0; i < localTurns.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const lt = localTurns[i]
    const inputs = await embProcessor(gatherSpeech(audio, lt.speech))
    const output = await embModel(inputs)
    const vec = Float32Array.from(firstTensor(output).tolist()[0] as number[])
    embeddings.push(normalise(vec))
    onProgress?.(0.6 + ((i + 1) / localTurns.length) * 0.4)
  }

  return { localTurns, embeddings }
}

/** Clusters the embeddings and turns the result into a speaker timeline. */
export function assignSpeakers(
  { localTurns, embeddings }: Analysis,
  options: Pick<DiarizeOptions, 'clusterThreshold' | 'numSpeakers' | 'maxSpeakers'> = {},
): DiarizeResult {
  const {
    clusterThreshold = DEFAULT_CLUSTER_THRESHOLD,
    numSpeakers,
    maxSpeakers = 10,
  } = options
  if (embeddings.length === 0) return { turns: [], speakerCount: 0 }

  const labels = agglomerativeCluster(embeddings, {
    threshold: clusterThreshold,
    maxSpeakers,
    numSpeakers,
  })

  const raw: SpeakerTurn[] = []
  localTurns.forEach((lt, i) => {
    for (const iv of lt.intervals) {
      raw.push({ start: iv.start, end: iv.end, speaker: labels[i] })
    }
  })

  const flattened = dropShortTurns(flattenTurns(raw))
  const turns = renumberSpeakers(mergeTurns(absorbTinySpeakers(mergeTurns(flattened))))
  const speakerCount = new Set(turns.map((t) => t.speaker)).size
  return { turns, speakerCount }
}

/** Returns a non-overlapping speaker timeline covering the whole recording. */
export async function diarize(
  audio: Float32Array,
  backend: Backend,
  options: DiarizeOptions = {},
): Promise<DiarizeResult> {
  const analysis = await analyse(audio, backend, options)
  return assignSpeakers(analysis, options)
}
