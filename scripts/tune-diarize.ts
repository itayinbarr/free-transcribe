/**
 * Prints the speaker-embedding distance distribution for a real recording and
 * the speaker count each clustering threshold would produce, so the default is
 * chosen from data rather than from a paper's number.
 *
 *   node scripts/tune-diarize.ts <file> [--offset 0] [--duration 180]
 */

import { analyse, assignSpeakers } from '../src/lib/diarize.ts'
import { cosineDistance } from '../src/lib/cluster.ts'
import { decodeToPcm } from './decode.ts'

function flag(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const file = process.argv[2]
const audio = await decodeToPcm(file, {
  offset: Number(flag('offset', '0')),
  duration: Number(flag('duration', '180')),
})

const analysis = await analyse(audio, 'cpu', {
  onProgress: (r) => process.stdout.write(`\ranalysing ${Math.round(r * 100)}%   `),
})
console.log(`\nlocal turns: ${analysis.localTurns.length}`)

const distances: number[] = []
for (let i = 0; i < analysis.embeddings.length; i++) {
  for (let j = i + 1; j < analysis.embeddings.length; j++) {
    distances.push(cosineDistance(analysis.embeddings[i], analysis.embeddings[j]))
  }
}
distances.sort((a, b) => a - b)
const pct = (p: number) => distances[Math.floor(distances.length * p)]?.toFixed(3)
console.log(
  `pairwise cosine distance: min=${distances[0]?.toFixed(3)} p10=${pct(0.1)} p25=${pct(0.25)} ` +
    `median=${pct(0.5)} p75=${pct(0.75)} p90=${pct(0.9)} max=${distances.at(-1)?.toFixed(3)}`,
)

// A conversation should show two humps: within-speaker and between-speaker.
const bins = new Array(20).fill(0)
for (const d of distances) bins[Math.min(19, Math.floor(d * 20))]++
bins.forEach((count, i) => {
  if (count === 0) return
  const bar = '#'.repeat(Math.ceil((count / Math.max(...bins)) * 50))
  console.log(`${(i / 20).toFixed(2)}-${((i + 1) / 20).toFixed(2)} ${String(count).padStart(5)} ${bar}`)
})

console.log('\nthreshold -> speakers (share of time per speaker)')
for (const threshold of [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8]) {
  const { turns, speakerCount } = assignSpeakers(analysis, { clusterThreshold: threshold })
  const share = new Map<number, number>()
  for (const t of turns) share.set(t.speaker, (share.get(t.speaker) ?? 0) + (t.end - t.start))
  const total = [...share.values()].reduce((a, b) => a + b, 0) || 1
  const summary = [...share.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([s, secs]) => `S${s + 1}:${Math.round((secs / total) * 100)}%`)
    .join(' ')
  console.log(`  ${threshold.toFixed(2)} -> ${speakerCount}  ${summary}`)
}
