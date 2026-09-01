/** One queued or finished recording, with its transcript and export actions. */

import { useState } from 'react'
import { ExportBar } from './ExportBar.tsx'
import { Transcript } from './Transcript.tsx'
import { formatBytes } from '../lib/audio.ts'
import { formatTimecode } from '../lib/text.ts'
import type { Job } from '../hooks/useTranscriber.ts'

interface Props {
  job: Job
  onCancel: (id: string) => void
  onRemove: (id: string) => void
}

const STATUS_TEXT: Record<Job['status'], string> = {
  queued: 'Waiting',
  decoding: 'Reading audio',
  running: 'Transcribing',
  done: 'Done',
  error: 'Failed',
  cancelled: 'Stopped',
}

export function JobCard({ job, onCancel, onRemove }: Props) {
  const [names, setNames] = useState<Record<number, string>>({})
  const [open, setOpen] = useState(true)
  const finished = job.status === 'done' && job.result

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-100 p-4 dark:border-slate-800">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{job.name}</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {formatBytes(job.size)}
            {job.result && ` · ${formatTimecode(job.result.duration, true)}`}
            {job.result && job.result.speakerCount > 0 && ` · ${job.result.speakerCount} speakers`}
            {' · '}
            {STATUS_TEXT[job.status]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {job.segments.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="min-h-11 rounded-lg px-3 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              {open ? 'Hide' : 'Show'}
            </button>
          )}
          {(job.status === 'queued' || job.status === 'running') && (
            <button
              type="button"
              onClick={() => onCancel(job.id)}
              className="min-h-11 rounded-lg px-3 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              Stop
            </button>
          )}
          {(job.status === 'done' || job.status === 'error' || job.status === 'cancelled') && (
            <button
              type="button"
              onClick={() => onRemove(job.id)}
              className="min-h-11 rounded-lg px-3 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              Remove
            </button>
          )}
        </div>
      </header>

      {job.error && (
        <p className="border-b border-slate-100 p-4 text-sm text-red-600 dark:border-slate-800 dark:text-red-400">
          {job.error}
        </p>
      )}

      {open && job.segments.length > 0 && (
        <div className="space-y-4 p-4">
          {finished && job.result && (
            <ExportBar result={job.result} sourceName={job.name} names={names} />
          )}
          <div className="max-h-[28rem] overflow-y-auto pe-1">
            <Transcript
              segments={job.segments}
              rtl={job.language === 'he'}
              duration={job.result?.duration}
              names={names}
              onRename={
                job.diarize
                  ? (index, name) => setNames((current) => ({ ...current, [index]: name }))
                  : undefined
              }
            />
          </div>
        </div>
      )}
    </article>
  )
}
