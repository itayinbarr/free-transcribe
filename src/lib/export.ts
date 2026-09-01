/**
 * Transcript serialisation. Pure string work, no DOM, so it is unit testable
 * and usable from the Node harness. PDF lives in pdf.ts because it needs a
 * browser and a font.
 */

import { formatSrtTime, formatTimecode, speakerName } from './text.ts'
import type { Segment, TranscriptResult } from './types.ts'

export interface ExportOptions {
  /** Prefix each block with its start time. */
  timecodes?: boolean
  /** Show speaker labels when the transcript has them. */
  speakers?: boolean
  /** Overrides for renamed speakers, keyed by zero-based index. */
  speakerNames?: Record<number, string>
  /** Title used by the markdown and PDF exports. */
  title?: string
}

export interface Block {
  start: number
  end: number
  speaker?: number
  text: string
}

/**
 * Groups consecutive segments by speaker into readable paragraphs. Without
 * diarization everything is one speaker, so segments are grouped into runs of a
 * sane paragraph length instead.
 */
export function toBlocks(segments: Segment[], maxParagraphSeconds = 45): Block[] {
  const blocks: Block[] = []
  for (const segment of segments) {
    const last = blocks.at(-1)
    const sameSpeaker = last && last.speaker === segment.speaker
    const shortEnough = last && segment.end - last.start <= maxParagraphSeconds
    if (last && sameSpeaker && (segment.speaker !== undefined || shortEnough)) {
      last.text = `${last.text} ${segment.text}`.trim()
      last.end = segment.end
    } else {
      blocks.push({ start: segment.start, end: segment.end, speaker: segment.speaker, text: segment.text })
    }
  }
  return blocks
}

function labelFor(index: number, names?: Record<number, string>): string {
  return names?.[index] ?? speakerName(index)
}

export function toText(result: TranscriptResult, options: ExportOptions = {}): string {
  const { timecodes = false, speakers = true, speakerNames } = options
  const useHours = result.duration >= 3600
  return toBlocks(result.segments)
    .map((block) => {
      const parts: string[] = []
      if (timecodes) parts.push(`[${formatTimecode(block.start, useHours)}]`)
      if (speakers && block.speaker !== undefined) parts.push(`${labelFor(block.speaker, speakerNames)}:`)
      parts.push(block.text)
      return parts.join(' ')
    })
    .join('\n\n')
    .trim()
}

export function toMarkdown(result: TranscriptResult, options: ExportOptions = {}): string {
  const { timecodes = true, speakers = true, speakerNames, title = 'Transcript' } = options
  const useHours = result.duration >= 3600
  const lines: string[] = [`# ${title}`, '']

  const meta = [
    `Duration: ${formatTimecode(result.duration, true)}`,
    `Language: ${result.language === 'he' ? 'Hebrew' : 'English'}`,
  ]
  if (result.speakerCount > 0) meta.push(`Speakers: ${result.speakerCount}`)
  lines.push(meta.join(' · '), '')

  let currentSpeaker: number | undefined = -1
  for (const block of toBlocks(result.segments)) {
    if (speakers && block.speaker !== undefined && block.speaker !== currentSpeaker) {
      currentSpeaker = block.speaker
      lines.push('', `### ${labelFor(block.speaker, speakerNames)}`, '')
    }
    lines.push(timecodes ? `**[${formatTimecode(block.start, useHours)}]** ${block.text}` : block.text, '')
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

export function toSrt(result: TranscriptResult, options: ExportOptions = {}): string {
  const { speakers = true, speakerNames } = options
  return result.segments
    .map((segment, i) => {
      const label = speakers && segment.speaker !== undefined
        ? `${labelFor(segment.speaker, speakerNames)}: `
        : ''
      return `${i + 1}\n${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}\n${label}${segment.text}\n`
    })
    .join('\n')
}

/** Filename stem for a downloaded transcript, derived from the source file. */
export function exportFilename(sourceName: string, extension: string): string {
  const stem = sourceName.replace(/\.[^.]+$/, '') || 'transcript'
  return `${stem}.${extension}`
}
