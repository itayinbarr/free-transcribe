import { describe, expect, it } from 'vitest'
import {
  activityToIntervals,
  blockRanges,
  clipIntervals,
  decodePowerset,
  dropShortTurns,
  flattenTurns,
  mergeTurns,
  packWorkUnits,
  POWERSET,
} from '../../src/lib/segments.ts'

describe('decodePowerset', () => {
  it('maps each class to the speakers it represents', () => {
    expect(POWERSET[0]).toEqual([])
    expect(POWERSET[4]).toEqual([0, 1])
  })

  it('takes the arg-max class per frame', () => {
    const frames = [
      [9, 0, 0, 0, 0, 0, 0], // nobody
      [0, 9, 0, 0, 0, 0, 0], // speaker 0
      [0, 0, 0, 0, 9, 0, 0], // speakers 0 and 1 together
    ]
    expect(decodePowerset(frames)).toEqual([[], [0], [0, 1]])
  })
})

describe('activityToIntervals', () => {
  it('turns a run of active frames into one interval', () => {
    const active = [false, true, true, true, false]
    expect(activityToIntervals(active, 1)).toEqual([{ start: 1, end: 4 }])
  })

  it('closes an interval that runs to the last frame', () => {
    expect(activityToIntervals([true, true], 0.5)).toEqual([{ start: 0, end: 1 }])
  })

  it('applies the offset and the minimum duration', () => {
    const active = [true, false, true, true]
    expect(activityToIntervals(active, 1, 10, 1.5)).toEqual([{ start: 12, end: 14 }])
  })
})

describe('clipIntervals', () => {
  it('trims to the window and drops what falls outside', () => {
    const input = [
      { start: 0, end: 3 },
      { start: 8, end: 12 },
      { start: 20, end: 22 },
    ]
    expect(clipIntervals(input, 2, 10)).toEqual([
      { start: 2, end: 3 },
      { start: 8, end: 10 },
    ])
  })
})

describe('flattenTurns', () => {
  it('leaves a non-overlapping timeline alone', () => {
    const turns = [
      { start: 0, end: 5, speaker: 0 },
      { start: 5, end: 9, speaker: 1 },
    ]
    expect(flattenTurns(turns)).toEqual(turns)
  })

  it('gives overlapped audio to the speaker who talks more overall', () => {
    const turns = [
      { start: 0, end: 10, speaker: 0 },
      { start: 4, end: 6, speaker: 1 },
    ]
    // Speaker 0 holds 10s against speaker 1's 2s, so the overlap goes to 0
    // and the result is one uninterrupted turn.
    expect(flattenTurns(turns)).toEqual([{ start: 0, end: 10, speaker: 0 }])
  })

  it('never emits overlapping output', () => {
    const turns = [
      { start: 0, end: 6, speaker: 0 },
      { start: 3, end: 9, speaker: 1 },
      { start: 8, end: 12, speaker: 0 },
    ]
    const out = flattenTurns(turns)
    for (let i = 1; i < out.length; i++) {
      expect(out[i].start).toBeGreaterThanOrEqual(out[i - 1].end)
    }
  })
})

describe('mergeTurns', () => {
  it('joins same-speaker turns across a short gap', () => {
    const turns = [
      { start: 0, end: 2, speaker: 0 },
      { start: 2.5, end: 4, speaker: 0 },
    ]
    expect(mergeTurns(turns, 0.75)).toEqual([{ start: 0, end: 4, speaker: 0 }])
  })

  it('keeps turns apart when the gap is long', () => {
    const turns = [
      { start: 0, end: 2, speaker: 0 },
      { start: 5, end: 6, speaker: 0 },
    ]
    expect(mergeTurns(turns, 0.75)).toHaveLength(2)
  })

  it('never merges across a speaker change', () => {
    const turns = [
      { start: 0, end: 2, speaker: 0 },
      { start: 2.1, end: 4, speaker: 1 },
    ]
    expect(mergeTurns(turns)).toHaveLength(2)
  })
})

describe('dropShortTurns', () => {
  it('removes turns below the floor', () => {
    const turns = [
      { start: 0, end: 0.2, speaker: 0 },
      { start: 1, end: 3, speaker: 1 },
    ]
    expect(dropShortTurns(turns, 0.4)).toEqual([{ start: 1, end: 3, speaker: 1 }])
  })
})

describe('packWorkUnits', () => {
  it('splits a turn longer than the window', () => {
    const units = packWorkUnits([{ start: 0, end: 75, speaker: 0 }], 30)
    expect(units).toHaveLength(3)
    expect(units[0].start).toBe(0)
    expect(units.at(-1)!.end).toBe(75)
    for (const unit of units) expect(unit.end - unit.start).toBeLessThanOrEqual(30.001)
  })

  it('combines consecutive turns from one speaker up to the window', () => {
    const units = packWorkUnits(
      [
        { start: 0, end: 10, speaker: 0 },
        { start: 10, end: 18, speaker: 0 },
      ],
      30,
    )
    expect(units).toEqual([{ start: 0, end: 18, speaker: 0 }])
  })

  it('starts a new unit when the speaker changes', () => {
    const units = packWorkUnits(
      [
        { start: 0, end: 5, speaker: 0 },
        { start: 5, end: 9, speaker: 1 },
      ],
      30,
    )
    expect(units).toHaveLength(2)
  })

  it('covers the whole timeline with no gaps', () => {
    const turns = [
      { start: 0, end: 44, speaker: 0 },
      { start: 44, end: 50, speaker: 1 },
    ]
    const units = packWorkUnits(turns, 30)
    expect(units[0].start).toBe(0)
    expect(units.at(-1)!.end).toBe(50)
  })
})

describe('blockRanges', () => {
  it('covers the duration exactly', () => {
    const blocks = blockRanges(250, 120)
    expect(blocks).toEqual([
      { start: 0, end: 120 },
      { start: 120, end: 240 },
      { start: 240, end: 250 },
    ])
  })
})
