/** Renders the transcript, growing live as segments arrive from the worker. */

import { toBlocks } from '../lib/export.ts'
import { formatTimecode, speakerName } from '../lib/text.ts'
import type { Segment } from '../lib/types.ts'

interface Props {
  segments: Segment[]
  rtl: boolean
  duration?: number
  /** Renamed speakers, keyed by zero-based index. */
  names: Record<number, string>
  onRename?: (index: number, name: string) => void
}

const SPEAKER_COLOURS = [
  'text-indigo-600 dark:text-indigo-400',
  'text-emerald-600 dark:text-emerald-400',
  'text-amber-600 dark:text-amber-400',
  'text-rose-600 dark:text-rose-400',
  'text-sky-600 dark:text-sky-400',
  'text-purple-600 dark:text-purple-400',
]

export function Transcript({ segments, rtl, duration, names, onRename }: Props) {
  if (segments.length === 0) return null
  const blocks = toBlocks(segments)
  const useHours = (duration ?? segments.at(-1)?.end ?? 0) >= 3600

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-4">
      {blocks.map((block, index) => {
        const previous = blocks[index - 1]
        const newSpeaker = block.speaker !== undefined && block.speaker !== previous?.speaker
        return (
          <div key={`${block.start}-${index}`}>
            {newSpeaker && block.speaker !== undefined && (
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`text-sm font-semibold ${SPEAKER_COLOURS[block.speaker % SPEAKER_COLOURS.length]}`}
                >
                  {names[block.speaker] ?? speakerName(block.speaker)}
                </span>
                {onRename && (
                  <button
                    type="button"
                    onClick={() => {
                      const current = names[block.speaker!] ?? speakerName(block.speaker!)
                      const next = window.prompt('Name this speaker', current)
                      if (next !== null) onRename(block.speaker!, next.trim() || current)
                    }}
                    className="rounded px-1 text-xs text-slate-400 transition hover:text-slate-700 dark:hover:text-slate-200"
                    aria-label="Rename speaker"
                  >
                    rename
                  </button>
                )}
              </div>
            )}
            <p className="text-[0.95rem] leading-relaxed text-slate-800 dark:text-slate-200">
              <span
                dir="ltr"
                className="me-2 inline-block align-baseline font-mono text-xs text-slate-400 tabular-nums dark:text-slate-500"
              >
                {formatTimecode(block.start, useHours)}
              </span>
              {block.text}
            </p>
          </div>
        )
      })}
    </div>
  )
}
