import { useCallback, useEffect, useMemo, useState } from 'react'
import { modelWarning } from './lib/device.ts'
import { Controls } from './components/Controls.tsx'
import { Dropzone } from './components/Dropzone.tsx'
import { JobCard } from './components/JobCard.tsx'
import { ProgressPanel } from './components/ProgressPanel.tsx'
import { useTranscriber } from './hooks/useTranscriber.ts'
import {
  availableTiers,
  DIARIZATION_SIZE_MB,
  EMBEDDING_MODEL,
  getAsrModel,
  SEGMENTATION_MODEL,
} from './lib/models.ts'
import type { Language, Tier } from './lib/types.ts'

export default function App() {
  const [language, setLanguage] = useState<Language>('he')
  const [tier, setTier] = useState<Tier>('accurate')
  const [diarize, setDiarize] = useState(false)
  const [started, setStarted] = useState(false)

  const { backend, model, jobs, currentJob, queuedCount, preload, enqueue, cancelJob, removeJob } =
    useTranscriber()

  const asrModel = getAsrModel(language, tier)
  const totalMB = asrModel.sizeMB + (diarize ? DIARIZATION_SIZE_MB : 0)
  const warning = useMemo(() => modelWarning(totalMB), [totalMB])

  // Hebrew offers one tier and English offers three, so a language switch can
  // leave the tier pointing at something that does not exist for it.
  useEffect(() => {
    const tiers = availableTiers(language)
    if (!tiers.includes(tier)) setTier(tiers.at(-1) ?? 'accurate')
  }, [language, tier])

  const begin = useCallback(() => {
    if (started) return
    setStarted(true)
    preload(language, tier, diarize)
  }, [diarize, language, preload, started, tier])

  const onFiles = useCallback(
    (files: File[]) => {
      begin()
      enqueue(files, language, tier, diarize)
    },
    [begin, diarize, enqueue, language, tier],
  )

  const settingsLocked = started
  const visibleJobs = useMemo(() => [...jobs].reverse(), [jobs])

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">free-transcribe</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-400">
            Transcribe Hebrew and English recordings in your browser. The audio never leaves your
            device: the model runs locally on WebGPU, there is no server and nothing is uploaded.
          </p>
        </header>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-700 dark:bg-slate-900">
          <Controls
            language={language}
            tier={tier}
            diarize={diarize}
            locked={settingsLocked}
            onLanguage={setLanguage}
            onTier={setTier}
            onDiarize={setDiarize}
          />
          {settingsLocked && (
            <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
              Settings are fixed once the model starts loading. Reload the page to change them.
            </p>
          )}
          {!settingsLocked && warning && (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {warning}
            </p>
          )}
          {!settingsLocked && (
            <button
              type="button"
              onClick={begin}
              className="mt-5 min-h-11 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 sm:w-auto"
            >
              Download the model ({totalMB} MB)
            </button>
          )}
        </section>

        <div className="space-y-6">
          <ProgressPanel
            model={model}
            job={currentJob}
            queuedCount={queuedCount}
            onCancel={cancelJob}
          />

          <Dropzone
            onFiles={onFiles}
            hint="MP3, WAV, M4A, FLAC, OGG, Opus, MP4, MOV and more. Long recordings are fine."
          />

          {visibleJobs.map((job) => (
            <JobCard key={job.id} job={job} onCancel={cancelJob} onRemove={removeJob} />
          ))}
        </div>

        <footer className="mt-12 border-t border-slate-200 pt-6 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <p>
            {backend === 'webgpu' && 'Running on WebGPU. '}
            {backend === 'wasm' &&
              'WebGPU is unavailable in this browser, so this falls back to CPU, which is much slower. Chrome or Edge on a desktop is the fastest option. '}
            Open source under the MIT licence.{' '}
            <a
              className="underline underline-offset-2 hover:text-slate-900 dark:hover:text-slate-100"
              href="https://github.com/itayinbarr/free-transcribe"
            >
              Source on GitHub
            </a>
            .
          </p>
          <p className="mt-2">
            Models: {asrModel.source} ({asrModel.license}), {SEGMENTATION_MODEL.source} (
            {SEGMENTATION_MODEL.license}), {EMBEDDING_MODEL.source} ({EMBEDDING_MODEL.license}).
          </p>
        </footer>
      </div>
    </div>
  )
}
