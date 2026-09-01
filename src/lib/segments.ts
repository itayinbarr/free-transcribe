/**
 * Pure timeline helpers: powerset decoding, interval building, overlap
 * resolution and work-unit packing. No model calls, no DOM.
 */

import type { SpeakerTurn } from './types.ts'

/**
 * pyannote/segmentation-3.0 emits a 7-class powerset per frame:
 *   0 nobody, 1..3 one speaker, 4..6 a pair of speakers.
 * This maps a class index to the local speaker indices it represents.
 */
export const POWERSET: number[][] = [[], [0], [1], [2], [0, 1], [0, 2], [1, 2]]

/** Picks the arg-max class per frame and expands it to active speakers. */
export function decodePowerset(frames: number[][]): number[][] {
  return frames.map((scores) => {
    let best = 0
    for (let c = 1; c < scores.length; c++) {
      if (scores[c] > scores[best]) best = c
    }
    return POWERSET[best] ?? []
  })
}

export interface Interval {
  start: number
  end: number
}

/**
 * Turns a per-frame activity mask for one speaker into time intervals.
 * `offset` shifts frame time into recording time.
 */
export function activityToIntervals(
  active: boolean[],
  frameDuration: number,
  offset = 0,
  minDuration = 0,
): Interval[] {
  const out: Interval[] = []
  let runStart = -1
  for (let i = 0; i <= active.length; i++) {
    const on = i < active.length && active[i]
    if (on && runStart < 0) runStart = i
    if (!on && runStart >= 0) {
      const start = offset + runStart * frameDuration
      const end = offset + i * frameDuration
      if (end - start >= minDuration) out.push({ start, end })
      runStart = -1
    }
  }
  return out
}

/** Clips intervals to a window, dropping anything fully outside it. */
export function clipIntervals(intervals: Interval[], from: number, to: number): Interval[] {
  const out: Interval[] = []
  for (const iv of intervals) {
    const start = Math.max(iv.start, from)
    const end = Math.min(iv.end, to)
    if (end > start) out.push({ start, end })
  }
  return out
}

/**
 * Resolves a set of possibly overlapping speaker intervals into a single
 * non-overlapping timeline. Where two speakers overlap, the region goes to
 * whichever of them holds more total speech nearby, which keeps a short
 * interjection from splitting the dominant speaker's turn.
 */
export function flattenTurns(turns: SpeakerTurn[]): SpeakerTurn[] {
  if (turns.length === 0) return []

  const totals = new Map<number, number>()
  for (const t of turns) {
    totals.set(t.speaker, (totals.get(t.speaker) ?? 0) + (t.end - t.start))
  }

  // Sweep over every boundary; each elementary slice goes to one speaker.
  const bounds = new Set<number>()
  for (const t of turns) {
    bounds.add(t.start)
    bounds.add(t.end)
  }
  const points = [...bounds].sort((a, b) => a - b)

  const out: SpeakerTurn[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]
    const end = points[i + 1]
    if (end - start <= 0) continue
    const mid = (start + end) / 2
    const covering = turns.filter((t) => t.start <= mid && t.end >= mid)
    if (covering.length === 0) continue
    let winner = covering[0]
    for (const c of covering) {
      if ((totals.get(c.speaker) ?? 0) > (totals.get(winner.speaker) ?? 0)) winner = c
    }
    const last = out.at(-1)
    if (last && last.speaker === winner.speaker && Math.abs(last.end - start) < 1e-6) {
      last.end = end
    } else {
      out.push({ start, end, speaker: winner.speaker })
    }
  }
  return out
}

/** Joins same-speaker turns separated by less than `maxGap` seconds. */
export function mergeTurns(turns: SpeakerTurn[], maxGap = 0.75): SpeakerTurn[] {
  const sorted = [...turns].sort((a, b) => a.start - b.start)
  const out: SpeakerTurn[] = []
  for (const t of sorted) {
    const last = out.at(-1)
    if (last && last.speaker === t.speaker && t.start - last.end <= maxGap) {
      last.end = Math.max(last.end, t.end)
    } else {
      out.push({ ...t })
    }
  }
  return out
}

/**
 * Renumbers speakers by first appearance and closes any gaps.
 *
 * Clustering assigns indices before overlaps are resolved, and resolving them
 * can remove a speaker from the timeline entirely, which otherwise leaves a
 * transcript jumping from "Speaker 1" to "Speaker 4" with nothing in between.
 */
export function renumberSpeakers(turns: SpeakerTurn[]): SpeakerTurn[] {
  const remap = new Map<number, number>()
  for (const turn of turns) {
    if (!remap.has(turn.speaker)) remap.set(turn.speaker, remap.size)
  }
  return turns.map((turn) => ({ ...turn, speaker: remap.get(turn.speaker)! }))
}

/**
 * Folds away speakers who barely speak.
 *
 * A one-word interjection is not enough voice for a reliable embedding, so it
 * often lands in a cluster of its own and shows up as a phantom extra speaker.
 * Any speaker holding less than `minTotal` seconds across the whole recording
 * is merged into whoever speaks immediately around them.
 */
export function absorbTinySpeakers(turns: SpeakerTurn[], minTotal = 3): SpeakerTurn[] {
  const totals = new Map<number, number>()
  for (const turn of turns) {
    totals.set(turn.speaker, (totals.get(turn.speaker) ?? 0) + (turn.end - turn.start))
  }
  const tiny = new Set([...totals.entries()].filter(([, t]) => t < minTotal).map(([s]) => s))
  // Everyone is tiny only when the recording itself is tiny; leave it alone.
  if (tiny.size === 0 || tiny.size === totals.size) return turns

  return turns.map((turn, index) => {
    if (!tiny.has(turn.speaker)) return turn
    const before = findNeighbour(turns, index, -1, tiny)
    const after = findNeighbour(turns, index, 1, tiny)
    const neighbour = before ?? after
    // Speaker 0 is a valid neighbour, so this must not be a truthiness check.
    return neighbour === undefined ? turn : { ...turn, speaker: neighbour }
  })
}

function findNeighbour(
  turns: SpeakerTurn[],
  from: number,
  step: number,
  tiny: Set<number>,
): number | undefined {
  for (let i = from + step; i >= 0 && i < turns.length; i += step) {
    if (!tiny.has(turns[i].speaker)) return turns[i].speaker
  }
  return undefined
}

/** Drops turns shorter than `minDuration`, which are usually breath or noise. */
export function dropShortTurns(turns: SpeakerTurn[], minDuration = 0.4): SpeakerTurn[] {
  return turns.filter((t) => t.end - t.start >= minDuration)
}

export interface WorkUnit {
  start: number
  end: number
  speaker?: number
}

/**
 * Packs turns into units Whisper can swallow whole. A turn longer than
 * `maxDuration` is split; consecutive turns by the same speaker are combined up
 * to the limit so Whisper sees as much context as it can use.
 */
export function packWorkUnits(turns: SpeakerTurn[], maxDuration = 30): WorkUnit[] {
  const out: WorkUnit[] = []
  for (const turn of turns) {
    const span = turn.end - turn.start
    if (span <= maxDuration) {
      const last = out.at(-1)
      if (last && last.speaker === turn.speaker && turn.end - last.start <= maxDuration) {
        last.end = turn.end
      } else {
        out.push({ start: turn.start, end: turn.end, speaker: turn.speaker })
      }
      continue
    }
    // Split evenly so no piece is a sliver, which Whisper handles badly.
    const pieces = Math.ceil(span / maxDuration)
    const step = span / pieces
    for (let i = 0; i < pieces; i++) {
      out.push({
        start: turn.start + i * step,
        end: i === pieces - 1 ? turn.end : turn.start + (i + 1) * step,
        speaker: turn.speaker,
      })
    }
  }
  return out
}

/** Splits a long recording into blocks for the no-diarization path. */
export function blockRanges(duration: number, blockSeconds: number): Interval[] {
  const out: Interval[] = []
  for (let start = 0; start < duration; start += blockSeconds) {
    out.push({ start, end: Math.min(start + blockSeconds, duration) })
  }
  return out
}
