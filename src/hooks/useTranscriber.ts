/**
 * Owns the worker, the model-loading state and the file queue.
 *
 * Model loading is deliberately decoupled from files: it starts as soon as the
 * language and tier are known, so people can queue recordings during the 563 MB
 * download instead of staring at a progress bar with nothing to do.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { decodeAudioFile } from '../lib/audio.ts'
import { getAsrModel, DIARIZATION_SIZE_MB } from '../lib/models.ts'
import type { Backend, Language, Progress, Segment, Tier, TranscriptResult } from '../lib/types.ts'
import type { WorkerRequest, WorkerResponse } from '../worker.ts'

export type JobStatus = 'queued' | 'decoding' | 'running' | 'done' | 'error' | 'cancelled'

export interface Job {
  id: string
  file: File
  name: string
  size: number
  status: JobStatus
  progress?: Progress
  segments: Segment[]
  result?: TranscriptResult
  error?: string
  /** Settings captured when the job was queued, so later UI changes cannot
   *  retroactively mislabel a finished transcript. */
  language: Language
  tier: Tier
  diarize: boolean
}

export type ModelPhase = 'idle' | 'loading' | 'ready' | 'error'

export interface ModelState {
  phase: ModelPhase
  /** 0..1 across every file the model needs. */
  ratio: number
  loadedBytes: number
  totalBytes: number
  currentFile: string
  sizeMB: number
  error?: string
}

let counter = 0
const nextId = () => `job-${Date.now().toString(36)}-${counter++}`

export function useTranscriber() {
  const workerRef = useRef<Worker | null>(null)
  const [backend, setBackend] = useState<Backend | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [model, setModel] = useState<ModelState>({
    phase: 'idle',
    ratio: 0,
    loadedBytes: 0,
    totalBytes: 0,
    currentFile: '',
    sizeMB: 0,
  })

  // Per-file download totals, so the bar reflects the whole model not one shard.
  const fileBytes = useRef(new Map<string, { loaded: number; total: number }>())
  const activeJob = useRef<string | null>(null)
  const pending = useRef<Job[]>([])

  const send = useCallback((message: WorkerRequest, transfer?: Transferable[]) => {
    workerRef.current?.postMessage(message, transfer ?? [])
  }, [])

  const updateJob = useCallback((id: string, patch: Partial<Job> | ((job: Job) => Partial<Job>)) => {
    setJobs((current) =>
      current.map((job) => (job.id === id ? { ...job, ...(typeof patch === 'function' ? patch(job) : patch) } : job)),
    )
  }, [])

  useEffect(() => {
    const worker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      switch (message.type) {
        case 'backend':
          setBackend(message.backend)
          break

        case 'model-progress': {
          fileBytes.current.set(message.file, { loaded: message.loaded, total: message.total })
          let loaded = 0
          let total = 0
          for (const entry of fileBytes.current.values()) {
            loaded += entry.loaded
            total += entry.total
          }
          setModel((current) => ({
            ...current,
            phase: 'loading',
            currentFile: message.file,
            loadedBytes: loaded,
            totalBytes: total,
            ratio: total > 0 ? Math.min(1, loaded / total) : 0,
          }))
          break
        }

        case 'model-ready':
          setModel((current) => ({ ...current, phase: 'ready', ratio: 1, sizeMB: message.sizeMB }))
          break

        case 'progress':
          updateJob(message.jobId, { progress: message.progress, status: 'running' })
          break

        case 'segment':
          updateJob(message.jobId, (job) => ({ segments: [...job.segments, message.segment] }))
          break

        case 'done':
          updateJob(message.jobId, { status: 'done', result: message.result, progress: undefined })
          activeJob.current = null
          break

        case 'cancelled':
          updateJob(message.jobId, { status: 'cancelled', progress: undefined })
          activeJob.current = null
          break

        case 'error':
          if (message.jobId) {
            updateJob(message.jobId, { status: 'error', error: message.message, progress: undefined })
            activeJob.current = null
          } else {
            setModel((current) => ({ ...current, phase: 'error', error: message.message }))
          }
          break
      }
    })

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [updateJob])

  /** Starts downloading weights for these settings. Safe to call repeatedly. */
  const preload = useCallback(
    (language: Language, tier: Tier, diarize: boolean) => {
      fileBytes.current.clear()
      const sizeMB = getAsrModel(language, tier).sizeMB + (diarize ? DIARIZATION_SIZE_MB : 0)
      setModel({ phase: 'loading', ratio: 0, loadedBytes: 0, totalBytes: 0, currentFile: '', sizeMB })
      send({ type: 'preload', language, tier, diarize })
    },
    [send],
  )

  const enqueue = useCallback(
    (files: File[], language: Language, tier: Tier, diarize: boolean) => {
      const created = files.map<Job>((file) => ({
        id: nextId(),
        file,
        name: file.name,
        size: file.size,
        status: 'queued',
        segments: [],
        language,
        tier,
        diarize,
      }))
      pending.current.push(...created)
      setJobs((current) => [...current, ...created])
    },
    [],
  )

  const removeJob = useCallback((id: string) => {
    pending.current = pending.current.filter((job) => job.id !== id)
    setJobs((current) => current.filter((job) => job.id !== id))
  }, [])

  const cancelJob = useCallback(
    (id: string) => {
      if (activeJob.current === id) send({ type: 'cancel', jobId: id })
      else removeJob(id)
    },
    [removeJob, send],
  )

  // Drain the queue one job at a time, decoding each file just before its turn
  // so several queued recordings never sit in memory as raw PCM at once.
  useEffect(() => {
    if (activeJob.current) return
    const next = pending.current.shift()
    if (!next) return

    activeJob.current = next.id
    updateJob(next.id, { status: 'decoding' })

    void (async () => {
      try {
        const audio = await decodeAudioFile(next.file, (message) =>
          updateJob(next.id, { progress: { stage: 'decoding', message } }),
        )
        updateJob(next.id, { status: 'running', progress: { stage: 'loading-models' } })
        send(
          {
            type: 'run',
            jobId: next.id,
            audio,
            language: next.language,
            tier: next.tier,
            diarize: next.diarize,
          },
          [audio.buffer],
        )
      } catch (error) {
        updateJob(next.id, {
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        })
        activeJob.current = null
      }
    })()
  }, [jobs, send, updateJob])

  const currentJob = useMemo(
    () => jobs.find((job) => job.status === 'running' || job.status === 'decoding') ?? null,
    [jobs],
  )

  const queuedCount = useMemo(() => jobs.filter((job) => job.status === 'queued').length, [jobs])

  return { backend, model, jobs, currentJob, queuedCount, preload, enqueue, cancelJob, removeJob }
}
