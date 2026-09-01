/**
 * The single progress surface. It narrates whichever phase the app is in:
 * downloading weights first, then the file currently being transcribed, then
 * how many are still waiting behind it.
 */

import { formatBytes } from '../lib/audio.ts'
import { formatTimecode } from '../lib/text.ts'
import type { Job, ModelState } from '../hooks/useTranscriber.ts'

interface Props {
  model: ModelState
  job: Job | null
  queuedCount: number
  onCancel?: (id: string) => void
}

function stageLabel(job: Job): string {
  const progress = job.progress
  if (job.status === 'decoding') return progress?.message ?? 'Reading the audio'
  switch (progress?.stage) {
    case 'loading-models':
      return 'Waiting for the model'
    case 'diarizing':
      return 'Telling the speakers apart'
    case 'transcribing':
      return 'Transcribing'
    case 'done':
      return 'Finishing up'
    default:
      return 'Starting'
  }
}

/** A determinate bar when we know the ratio, an indeterminate sweep when not. */
function Bar({ ratio }: { ratio?: number }) {
  const determinate = typeof ratio === 'number' && Number.isFinite(ratio)
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
      {determinate ? (
        <div
          className="h-full rounded-full bg-indigo-600 transition-[width] duration-300 ease-out dark:bg-indigo-400"
          style={{ width: `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%` }}
        />
      ) : (
        <div className="h-full w-1/3 animate-[slide_1.4s_ease-in-out_infinite] rounded-full bg-indigo-600 dark:bg-indigo-400" />
      )}
    </div>
  )
}

export function ProgressPanel({ model, job, queuedCount, onCancel }: Props) {
  const loadingModel = model.phase === 'loading'
  const show = loadingModel || job !== null || model.phase === 'error'
  if (!show) return null

  if (model.phase === 'error') {
    return (
      <section className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        <p className="font-medium">The model could not be loaded.</p>
        <p className="mt-1 opacity-80">{model.error}</p>
      </section>
    )
  }

  const secondsDone = job?.segments.at(-1)?.end
  const total = job?.result?.duration

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-700 dark:bg-slate-900"
      aria-live="polite"
    >
      {loadingModel && (
        <div className="mb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Downloading the model
            </h2>
            <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {model.totalBytes > 0
                ? `${formatBytes(model.loadedBytes)} of ${formatBytes(model.totalBytes)}`
                : `about ${model.sizeMB} MB`}
            </p>
          </div>
          <div className="mt-2">
            <Bar ratio={model.totalBytes > 0 ? model.ratio : undefined} />
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            This happens once per browser, then it is cached.{' '}
            <span className="text-slate-400 dark:text-slate-500">
              You can add files now and they will start automatically.
            </span>
          </p>
        </div>
      )}

      {job && (
        <div className={loadingModel ? 'border-t border-slate-200 pt-4 dark:border-slate-700' : ''}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="min-w-0 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <span className="block truncate">{job.name}</span>
            </h2>
            <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {stageLabel(job)}
              {secondsDone !== undefined && ` · ${formatTimecode(secondsDone)}`}
              {total !== undefined && ` / ${formatTimecode(total)}`}
            </p>
          </div>
          <div className="mt-2">
            <Bar ratio={job.progress?.ratio} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">
              {job.progress?.message ?? 'Working'}
              {queuedCount > 0 && ` · ${queuedCount} more waiting`}
            </p>
            {onCancel && job.status === 'running' && (
              <button
                type="button"
                onClick={() => onCancel(job.id)}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                Stop
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
