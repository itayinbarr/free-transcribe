/**
 * Transcription worker.
 *
 * Everything expensive happens here so the page stays responsive while a
 * 47-minute recording is being processed. Audio arrives already decoded (the
 * Web Audio API is main-thread only) and is transferred, not copied.
 */

import { loadAsr, warmUp } from './lib/asr.ts'
import { loadDiarizer } from './lib/diarize.ts'
import { getAsrModel } from './lib/models.ts'
import { transcribe } from './lib/pipeline.ts'
import type { Backend, Language, Progress, Segment, Tier, TranscriptResult } from './lib/types.ts'

export interface RunSpec {
  jobId: string
  language: Language
  tier: Tier
  diarize: boolean
}

export type WorkerRequest =
  | ({ type: 'preload' } & Omit<RunSpec, 'jobId'>)
  | ({ type: 'run'; audio: Float32Array } & RunSpec)
  | { type: 'cancel'; jobId: string }

export type WorkerResponse =
  | { type: 'backend'; backend: Backend; webgpu: boolean }
  | { type: 'model-progress'; file: string; loaded: number; total: number; ratio: number }
  | { type: 'model-ready'; sizeMB: number }
  | { type: 'progress'; jobId: string; progress: Progress }
  | { type: 'segment'; jobId: string; segment: Segment }
  | { type: 'done'; jobId: string; result: TranscriptResult }
  | { type: 'cancelled'; jobId: string }
  | { type: 'error'; jobId?: string; message: string }

const post = (message: WorkerResponse) => self.postMessage(message)

let backendPromise: Promise<Backend> | null = null

/**
 * WebGPU is 5-10x faster and is the only practical way to run the 563 MB model,
 * but it is missing on older browsers and on many phones, so fall back quietly.
 */
async function detectBackend(): Promise<Backend> {
  backendPromise ??= (async () => {
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu
    let backend: Backend = 'wasm'
    if (gpu) {
      try {
        const adapter = await gpu.requestAdapter()
        if (adapter) backend = 'webgpu'
      } catch {
        backend = 'wasm'
      }
    }
    post({ type: 'backend', backend, webgpu: backend === 'webgpu' })
    return backend
  })()
  return backendPromise
}

/** Downloads and compiles everything a run will need, before any file exists. */
async function preload(spec: Omit<RunSpec, 'jobId'>): Promise<void> {
  const backend = await detectBackend()
  const model = getAsrModel(spec.language, spec.tier)

  const transcriber = await loadAsr(model, backend, (p: Record<string, unknown>) => {
    if (p.status !== 'progress') return
    post({
      type: 'model-progress',
      file: String(p.file ?? ''),
      loaded: Number(p.loaded ?? 0),
      total: Number(p.total ?? 0),
      ratio: typeof p.progress === 'number' ? p.progress / 100 : 0,
    })
  })

  if (spec.diarize) {
    await loadDiarizer(backend, (p) => {
      const entry = p as Record<string, unknown>
      if (entry.status !== 'progress') return
      post({
        type: 'model-progress',
        file: String(entry.file ?? ''),
        loaded: Number(entry.loaded ?? 0),
        total: Number(entry.total ?? 0),
        ratio: typeof entry.progress === 'number' ? entry.progress / 100 : 0,
      })
    })
  }

  // First inference compiles shaders; do it now so the first file is not slow.
  // The monolingual flag has to come along: a model without language and task
  // tokens rejects them outright, and preload is where that first shows up.
  await warmUp(transcriber, spec.language, model.monolingual ?? false)
  post({ type: 'model-ready', sizeMB: model.sizeMB })
}

const controllers = new Map<string, AbortController>()

async function run(request: Extract<WorkerRequest, { type: 'run' }>): Promise<void> {
  const { jobId, audio, language, tier, diarize } = request
  const controller = new AbortController()
  controllers.set(jobId, controller)
  try {
    const backend = await detectBackend()
    const result = await transcribe(audio, {
      language,
      tier,
      diarize,
      backend,
      signal: controller.signal,
      onProgress: (progress) => post({ type: 'progress', jobId, progress }),
      onSegment: (segment) => post({ type: 'segment', jobId, segment }),
    })
    post({ type: 'done', jobId, result })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      post({ type: 'cancelled', jobId })
    } else {
      post({ type: 'error', jobId, message: error instanceof Error ? error.message : String(error) })
    }
  } finally {
    controllers.delete(jobId)
  }
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  switch (request.type) {
    case 'preload':
      preload(request).catch((error: unknown) =>
        post({ type: 'error', message: error instanceof Error ? error.message : String(error) }),
      )
      break
    case 'run':
      void run(request)
      break
    case 'cancel':
      controllers.get(request.jobId)?.abort()
      break
  }
})
