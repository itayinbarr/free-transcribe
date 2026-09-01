import { describe, expect, it } from 'vitest'
import { formatSrtTime, formatTimecode, isDegenerate, speakerName } from '../../src/lib/text.ts'

describe('formatTimecode', () => {
  it('drops the hour on short recordings', () => {
    expect(formatTimecode(65)).toBe('01:05')
  })

  it('shows the hour once there is one, or when forced', () => {
    expect(formatTimecode(3725)).toBe('01:02:05')
    expect(formatTimecode(65, true)).toBe('00:01:05')
  })

  it('clamps negatives to zero', () => {
    expect(formatTimecode(-5)).toBe('00:00')
  })
})

describe('formatSrtTime', () => {
  it('pads every field and keeps milliseconds', () => {
    expect(formatSrtTime(3725.5)).toBe('01:02:05,500')
    expect(formatSrtTime(0)).toBe('00:00:00,000')
  })
})

describe('isDegenerate', () => {
  it('flags a phrase repeated to fill the output', () => {
    expect(isDegenerate('ככה '.repeat(40))).toBe(true)
    expect(isDegenerate('yeah yeah yeah yeah yeah yeah yeah yeah yeah yeah yeah yeah yeah')).toBe(true)
  })

  it('flags a repeated multi-word phrase', () => {
    expect(isDegenerate('thanks for watching '.repeat(10))).toBe(true)
  })

  it('leaves normal speech alone', () => {
    const real =
      'I would start by describing the company, what it does, what the technology is, ' +
      'and then move on to the challenges we are facing right now and the bottlenecks.'
    expect(isDegenerate(real)).toBe(false)
  })

  it('does not flag short output', () => {
    expect(isDegenerate('no no no')).toBe(false)
  })
})

describe('speakerName', () => {
  it('is one-based for humans', () => {
    expect(speakerName(0)).toBe('Speaker 1')
  })
})
