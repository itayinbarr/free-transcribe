/** Copy to clipboard, or download as txt, md, srt or pdf. */

import { useState } from 'react'
import { exportFilename, toMarkdown, toSrt, toText } from '../lib/export.ts'
import type { TranscriptResult } from '../lib/types.ts'

interface Props {
  result: TranscriptResult
  sourceName: string
  names: Record<number, string>
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoke on the next frame so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ExportBar({ result, sourceName, names }: Props) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const title = sourceName.replace(/\.[^.]+$/, '')
  const options = { timecodes: true, speakerNames: names, title }

  const actions: { key: string; label: string; run: () => void | Promise<void> }[] = [
    {
      key: 'copy',
      label: copied ? 'Copied' : 'Copy',
      run: async () => {
        await navigator.clipboard.writeText(toText(result, options))
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      },
    },
    {
      key: 'txt',
      label: 'TXT',
      run: () =>
        download(
          new Blob([toText(result, options)], { type: 'text/plain;charset=utf-8' }),
          exportFilename(sourceName, 'txt'),
        ),
    },
    {
      key: 'md',
      label: 'Markdown',
      run: () =>
        download(
          new Blob([toMarkdown(result, options)], { type: 'text/markdown;charset=utf-8' }),
          exportFilename(sourceName, 'md'),
        ),
    },
    {
      key: 'srt',
      label: 'SRT',
      run: () =>
        download(
          new Blob([toSrt(result, options)], { type: 'application/x-subrip;charset=utf-8' }),
          exportFilename(sourceName, 'srt'),
        ),
    },
    {
      key: 'pdf',
      label: 'PDF',
      run: async () => {
        // Loaded on demand: jsPDF and the Hebrew font are only needed here.
        const { toPdf } = await import('../lib/pdf.ts')
        download(await toPdf(result, options), exportFilename(sourceName, 'pdf'))
      },
    },
  ]

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setError(null)
              setBusy(action.key)
              try {
                await action.run()
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause))
              } finally {
                setBusy(null)
              }
            }}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {busy === action.key ? '…' : action.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
