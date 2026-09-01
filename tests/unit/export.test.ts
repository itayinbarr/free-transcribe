import { describe, expect, it } from 'vitest'
import { exportFilename, toBlocks, toMarkdown, toSrt, toText } from '../../src/lib/export.ts'
import type { TranscriptResult } from '../../src/lib/types.ts'

const diarized: TranscriptResult = {
  language: 'he',
  duration: 65,
  elapsed: 10,
  speakerCount: 2,
  segments: [
    { start: 0, end: 5, text: 'שלום', speaker: 0 },
    { start: 5, end: 9, text: 'מה שלומך', speaker: 0 },
    { start: 9, end: 14, text: 'בסדר גמור', speaker: 1 },
  ],
}

const plain: TranscriptResult = {
  language: 'en',
  duration: 20,
  elapsed: 4,
  speakerCount: 0,
  segments: [
    { start: 0, end: 4, text: 'Hello there.' },
    { start: 4, end: 8, text: 'How are you?' },
  ],
}

describe('toBlocks', () => {
  it('merges consecutive segments from the same speaker', () => {
    const blocks = toBlocks(diarized.segments)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].text).toBe('שלום מה שלומך')
    expect(blocks[0].end).toBe(9)
  })

  it('starts a new block when the speaker changes', () => {
    expect(toBlocks(diarized.segments)[1].speaker).toBe(1)
  })

  it('caps paragraph length when there are no speakers', () => {
    const long = Array.from({ length: 40 }, (_, i) => ({
      start: i * 5,
      end: i * 5 + 5,
      text: `line ${i}`,
    }))
    const blocks = toBlocks(long, 45)
    expect(blocks.length).toBeGreaterThan(1)
    for (const block of blocks) expect(block.end - block.start).toBeLessThanOrEqual(50)
  })
})

describe('toText', () => {
  it('includes speaker labels and timecodes when asked', () => {
    const text = toText(diarized, { timecodes: true })
    expect(text).toContain('[00:00] Speaker 1: שלום מה שלומך')
    expect(text).toContain('[00:09] Speaker 2: בסדר גמור')
  })

  it('omits both when they are turned off', () => {
    const text = toText(diarized, { timecodes: false, speakers: false })
    expect(text).not.toContain('[')
    expect(text).not.toContain('Speaker')
  })

  it('uses renamed speakers', () => {
    const text = toText(diarized, { speakerNames: { 0: 'Dana' } })
    expect(text).toContain('Dana:')
    expect(text).toContain('Speaker 2:')
  })

  it('handles a transcript with no speakers', () => {
    expect(toText(plain)).toBe('Hello there. How are you?')
  })
})

describe('toMarkdown', () => {
  it('writes a heading per speaker and a metadata line', () => {
    const md = toMarkdown(diarized, { title: 'Meeting' })
    expect(md).toContain('# Meeting')
    expect(md).toContain('### Speaker 1')
    expect(md).toContain('### Speaker 2')
    expect(md).toContain('Speakers: 2')
    expect(md).toContain('Language: Hebrew')
  })

  it('leaves out the speaker count when there is none', () => {
    expect(toMarkdown(plain)).not.toContain('Speakers:')
  })
})

describe('toSrt', () => {
  it('numbers cues from one and formats the timestamps', () => {
    const srt = toSrt(plain)
    expect(srt.startsWith('1\n00:00:00,000 --> 00:00:04,000\nHello there.')).toBe(true)
    expect(srt).toContain('2\n00:00:04,000 --> 00:00:08,000')
  })

  it('prefixes the speaker when there is one', () => {
    expect(toSrt(diarized)).toContain('Speaker 1: שלום')
  })
})

describe('exportFilename', () => {
  it('swaps the extension', () => {
    expect(exportFilename('interview.m4a', 'txt')).toBe('interview.txt')
  })

  it('copes with a name that has no extension', () => {
    expect(exportFilename('notes', 'md')).toBe('notes.md')
  })
})
