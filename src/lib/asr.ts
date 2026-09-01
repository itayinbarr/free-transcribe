/**
 * Whisper loading and transcription. Deliberately free of DOM APIs so the exact
 * same code runs in the browser worker and in the Node benchmark harness.
 */

import { pipeline, type ProgressCallback } from '@huggingface/transformers'
import type { AsrModel } from './models.ts'
import { dtypeFor } from './models.ts'
import type { Backend, Language } from './types.ts'

export const SAMPLE_RATE = 16000

/** Whisper's receptive field. Never hand it more than this in one call. */
export const WHISPER_WINDOW_S = 30

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Transcriber = any

const cache = new Map<string, Promise<Transcriber>>()

function keyOf(model: AsrModel, backend: Backend): string {
  return `${model.id}|${backend}|${JSON.stringify(dtypeFor(model, backend))}`
}

export async function loadAsr(
  model: AsrModel,
  backend: Backend,
  onProgress?: ProgressCallback,
): Promise<Transcriber> {
  const key = keyOf(model, backend)
  let entry = cache.get(key)
  if (!entry) {
    entry = pipeline('automatic-speech-recognition', model.id, {
      device: backend,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dtype: dtypeFor(model, backend) as any,
      progress_callback: onProgress,
    })
    cache.set(key, entry)
  }
  return entry
}

/** Frees GPU memory held by every loaded pipeline. */
export async function disposeAsr(): Promise<void> {
  for (const entry of cache.values()) {
    try {
      const transcriber = await entry
      await transcriber?.dispose?.()
    } catch {
      // Disposal is best-effort; a failure here must not break the run.
    }
  }
  cache.clear()
}

/**
 * Runs one WebGPU warm-up pass so the first real chunk does not pay for shader
 * compilation. Cheap on wasm, so it is unconditional.
 */
export async function warmUp(transcriber: Transcriber, language: Language): Promise<void> {
  await transcriber(new Float32Array(SAMPLE_RATE), { language, task: 'transcribe' })
}

export interface RawChunk {
  timestamp: [number, number | null]
  text: string
}

/**
 * Transcribes a block of audio no longer than a few minutes, letting Whisper do
 * its own 30 s windowing inside. Returns timestamped chunks in block-local time.
 */
export async function transcribeBlock(
  transcriber: Transcriber,
  audio: Float32Array,
  language: Language,
): Promise<RawChunk[]> {
  const out = await transcriber(audio, {
    language,
    task: 'transcribe',
    chunk_length_s: WHISPER_WINDOW_S,
    stride_length_s: 5,
    return_timestamps: true,
  })
  const chunks: RawChunk[] = out?.chunks ?? []
  if (chunks.length === 0 && out?.text) {
    return [{ timestamp: [0, audio.length / SAMPLE_RATE], text: out.text }]
  }
  return chunks
}

/**
 * Transcribes a single speaker turn of at most 30 s as one unit. No internal
 * windowing, no timestamps: the caller already knows when this turn happened.
 */
export async function transcribeUnit(
  transcriber: Transcriber,
  audio: Float32Array,
  language: Language,
): Promise<string> {
  const out = await transcriber(audio, { language, task: 'transcribe' })
  return normaliseText(out?.text ?? '')
}

/**
 * Whisper emits a leading space and, on silence, repeats a handful of stock
 * phrases. Trim the space; leave the rest to the caller, which has the
 * duration context needed to judge a hallucination.
 */
export function normaliseText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
