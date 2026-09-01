/**
 * PDF export.
 *
 * Hebrew makes this the awkward one: a PDF has no bidi engine, so the text has
 * to be reordered into visual order before it is drawn, and the font has to
 * carry Hebrew glyphs. The font is fetched on demand rather than bundled, so
 * people who never export a PDF never download it.
 */

import bidiFactory from 'bidi-js'
import { jsPDF } from 'jspdf'
import { toBlocks, type ExportOptions } from './export.ts'
import { formatTimecode, speakerName } from './text.ts'
import type { TranscriptResult } from './types.ts'

const FONT_URL = `${import.meta.env.BASE_URL}fonts/transcript-font.ttf`
const FONT_NAME = 'TranscriptSans'

const bidi = bidiFactory()

let fontBase64: Promise<string> | null = null

function loadFont(): Promise<string> {
  fontBase64 ??= fetch(FONT_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`Could not load the PDF font (${response.status})`)
      return response.arrayBuffer()
    })
    .then((buffer) => {
      const bytes = new Uint8Array(buffer)
      let binary = ''
      // Chunked so a 45 KB font does not blow the argument limit of fromCharCode.
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      }
      return btoa(binary)
    })
  return fontBase64
}

/** Reorders one line of logical-order text into the visual order a PDF needs. */
export function toVisualOrder(line: string, rtl: boolean): string {
  if (!line) return line
  const levels = bidi.getEmbeddingLevels(line, rtl ? 'rtl' : 'ltr')
  return bidi.getReorderedString(line, levels)
}

export interface PdfOptions extends ExportOptions {
  /** Right-to-left layout. Set for Hebrew transcripts. */
  rtl?: boolean
}

export async function toPdf(result: TranscriptResult, options: PdfOptions = {}): Promise<Blob> {
  const {
    timecodes = true,
    speakers = true,
    speakerNames,
    title = 'Transcript',
    rtl = result.language === 'he',
  } = options

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  doc.addFileToVFS(`${FONT_NAME}.ttf`, await loadFont())
  doc.addFont(`${FONT_NAME}.ttf`, FONT_NAME, 'normal')
  doc.setFont(FONT_NAME, 'normal')

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 56
  const width = pageWidth - margin * 2
  const align = rtl ? 'right' : 'left'
  const anchorX = rtl ? pageWidth - margin : margin
  let y = margin

  const newPageIfNeeded = (needed: number) => {
    if (y + needed <= pageHeight - margin) return
    doc.addPage()
    y = margin
  }

  const write = (text: string, size: number, gap: number, colour: [number, number, number]) => {
    doc.setFontSize(size)
    doc.setTextColor(...colour)
    for (const line of doc.splitTextToSize(text, width) as string[]) {
      newPageIfNeeded(size * 1.45)
      doc.text(toVisualOrder(line, rtl), anchorX, y, { align })
      y += size * 1.45
    }
    y += gap
  }

  write(title, 18, 4, [17, 24, 39])

  const useHours = result.duration >= 3600
  const meta = [
    `${formatTimecode(result.duration, true)}`,
    result.language === 'he' ? 'Hebrew' : 'English',
  ]
  if (result.speakerCount > 0) meta.push(`${result.speakerCount} speakers`)
  write(meta.join('  ·  '), 9, 14, [107, 114, 128])

  let currentSpeaker: number | undefined = -1
  for (const block of toBlocks(result.segments)) {
    if (speakers && block.speaker !== undefined && block.speaker !== currentSpeaker) {
      currentSpeaker = block.speaker
      newPageIfNeeded(30)
      write(speakerNames?.[block.speaker] ?? speakerName(block.speaker), 11, 2, [37, 99, 235])
    }
    const prefix = timecodes ? `[${formatTimecode(block.start, useHours)}] ` : ''
    write(prefix + block.text, 10.5, 8, [17, 24, 39])
  }

  return doc.output('blob')
}
