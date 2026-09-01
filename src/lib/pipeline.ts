/**
 * The orchestrator: audio in, transcript out.
 *
 * Deliberately free of DOM and React so the browser worker and the Node
 * benchmark harness run byte-for-byte the same code path.
 */

import { loadAsr, SAMPLE_RATE, transcribeBlock, transcribeUnit, warmUp, WHISPER_WINDOW_S } from './asr.ts'
import { diarize } from './diarize.ts'
import { getAsrModel } from './models.ts'
import { blockRanges, packWorkUnits } from './segments.ts'
import { isDegenerate } from './text.ts'
import type { Progress, RunOptions, Segment, TranscriptResult } from './types.ts'

/**
 * How much audio to hand Whisper at once on the no-diarization path. Whisper
 * windows internally; this bound is about memory and progress granularity.
 */
const BLOCK_S = 120

/** Whisper misbehaves on very short clips, so pad anything under this. */
const MIN_UNIT_S = 1.0

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

/**
 * Views a time range of the recording, copying only when the range is too short
 * for Whisper and has to be zero-padded.
 */
function sliceAudio(audio: Float32Array, start: number, end: number): Float32Array {
  const from = Math.max(0, Math.floor(start * SAMPLE_RATE))
  const to = Math.min(audio.length, Math.ceil(end * SAMPLE_RATE))
  const slice = audio.subarray(from, to)
  const minSamples = Math.ceil(MIN_UNIT_S * SAMPLE_RATE)
  if (slice.length >= minSamples) return slice
  const padded = new Float32Array(minSamples)
  padded.set(slice)
  return padded
}

export async function transcribe(
  audio: Float32Array,
  options: RunOptions,
): Promise<TranscriptResult> {
  const {
    language,
    tier,
    diarize: withDiarization,
    backend = 'webgpu',
    clusterThreshold,
    numSpeakers,
    onProgress,
    onSegment,
    signal,
  } = options
  const started = performance.now()
  const duration = audio.length / SAMPLE_RATE
  const report = (p: Progress) => onProgress?.(p)

  const model = getAsrModel(language, tier)

  report({ stage: 'loading-models', message: `Loading ${model.label}` })
  const transcriber = await loadAsr(model, backend, (p: Record<string, unknown>) => {
    if (p.status === 'progress') {
      report({
        stage: 'loading-models',
        file: String(p.file ?? ''),
        loaded: Number(p.loaded ?? 0),
        total: Number(p.total ?? 0),
        ratio: typeof p.progress === 'number' ? p.progress / 100 : undefined,
      })
    }
  })
  throwIfAborted(signal)
  await warmUp(transcriber, language)

  const segments: Segment[] = []
  const push = (segment: Segment) => {
    if (!segment.text) return
    if (isDegenerate(segment.text)) return
    segments.push(segment)
    onSegment?.(segment)
  }

  let speakerCount = 0

  if (withDiarization) {
    report({ stage: 'diarizing', ratio: 0, message: 'Finding speakers' })
    const { turns, speakerCount: found } = await diarize(audio, backend, {
      clusterThreshold,
      numSpeakers,
      signal,
      onProgress: (ratio) => report({ stage: 'diarizing', ratio, message: 'Finding speakers' }),
    })
    speakerCount = found

    const units = packWorkUnits(turns, WHISPER_WINDOW_S)
    for (let i = 0; i < units.length; i++) {
      throwIfAborted(signal)
      const unit = units[i]
      const text = await transcribeUnit(transcriber, sliceAudio(audio, unit.start, unit.end), language)
      push({ start: unit.start, end: unit.end, text, speaker: unit.speaker })
      report({
        stage: 'transcribing',
        ratio: (i + 1) / units.length,
        message: `Segment ${i + 1} of ${units.length}`,
      })
    }

    // A diarization pass that found nothing usable must not silently produce an
    // empty transcript: fall back to the plain path.
    if (units.length > 0) {
      report({ stage: 'done', ratio: 1 })
      return finish()
    }
  }

  const blocks = blockRanges(duration, BLOCK_S)
  for (let i = 0; i < blocks.length; i++) {
    throwIfAborted(signal)
    const block = blocks[i]
    const chunks = await transcribeBlock(
      transcriber,
      sliceAudio(audio, block.start, block.end),
      language,
    )
    for (const chunk of chunks) {
      const start = block.start + (chunk.timestamp[0] ?? 0)
      const end = block.start + (chunk.timestamp[1] ?? chunk.timestamp[0] ?? 0)
      push({ start, end: Math.max(end, start), text: chunk.text.trim() })
    }
    report({
      stage: 'transcribing',
      ratio: (i + 1) / blocks.length,
      message: `${Math.round(block.end)}s of ${Math.round(duration)}s`,
    })
  }

  report({ stage: 'done', ratio: 1 })
  return finish()

  function finish(): TranscriptResult {
    // Count the speakers who actually made it into the transcript: a turn whose
    // text came back empty or degenerate is dropped, and reporting a speaker
    // the reader never sees is worse than reporting one fewer.
    const heard = new Set(
      segments.map((segment) => segment.speaker).filter((speaker) => speaker !== undefined),
    )
    return {
      segments,
      language,
      speakerCount: Math.min(speakerCount, heard.size) || heard.size,
      duration,
      elapsed: (performance.now() - started) / 1000,
    }
  }
}
