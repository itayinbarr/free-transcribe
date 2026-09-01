/**
 * Benchmark and transcript harness.
 *
 * Runs the real pipeline (src/lib/pipeline.ts) over a local file and writes the
 * transcript out, so model choices and diarization tuning are decided against
 * real recordings rather than guesses.
 *
 *   node scripts/bench.ts <file> [--lang he] [--tier accurate] [--backend cpu]
 *                                [--diarize] [--threshold 0.62]
 *                                [--offset 0] [--duration 180] [--out path]
 */

import { writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { DEFAULT_CLUSTER_THRESHOLD } from '../src/lib/diarize.ts'
import { toMarkdown, toSrt, toText } from '../src/lib/export.ts'
import { transcribe } from '../src/lib/pipeline.ts'
import type { Backend, Language, Tier } from '../src/lib/types.ts'
import { decodeToPcm, probeDuration } from './decode.ts'

function flag(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
function has(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

const file = process.argv[2]
if (!file) throw new Error('usage: node scripts/bench.ts <file> [options]')

const language = (flag('lang', 'he') as Language)
const tier = (flag('tier', 'accurate') as Tier)
const backend = (flag('backend', 'cpu') as Backend)
const withDiarization = has('diarize')
const threshold = Number(flag('threshold', String(DEFAULT_CLUSTER_THRESHOLD)))
const offset = Number(flag('offset', '0'))
const durationArg = flag('duration')
const out = flag('out')

const fullDuration = await probeDuration(file)
const audio = await decodeToPcm(file, {
  offset,
  duration: durationArg ? Number(durationArg) : undefined,
})

console.log(
  `file=${basename(file)} full=${fullDuration.toFixed(0)}s using=${(audio.length / 16000).toFixed(0)}s ` +
    `lang=${language} tier=${tier} backend=${backend} diarize=${withDiarization} threshold=${threshold}`,
)

let lastStage = ''
const result = await transcribe(audio, {
  language,
  tier,
  diarize: withDiarization,
  backend,
  clusterThreshold: threshold,
  numSpeakers: flag('speakers') ? Number(flag('speakers')) : undefined,
  onProgress: (p) => {
    const line = `${p.stage} ${p.ratio !== undefined ? `${Math.round(p.ratio * 100)}%` : ''} ${p.message ?? p.file ?? ''}`
    if (line !== lastStage) {
      lastStage = line
      process.stdout.write(`\r${line.padEnd(70)}`)
    }
  },
})

console.log(
  `\ndone in ${result.elapsed.toFixed(1)}s ` +
    `(RTF ${(result.duration / result.elapsed).toFixed(2)}x) ` +
    `segments=${result.segments.length} speakers=${result.speakerCount}`,
)

const stem = out ?? `/tmp/${basename(file).replace(/\.[^.]+$/, '')}`
const title = basename(file).replace(/^[0-9a-f]{8}-/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ')
const text = toText(result, { timecodes: true })
writeFileSync(`${stem}.txt`, text + '\n')
writeFileSync(`${stem}.md`, toMarkdown(result, { timecodes: true, title }))
writeFileSync(`${stem}.srt`, toSrt(result))
console.log(`wrote ${stem}.{txt,md,srt}`)
console.log(text.slice(0, 900))
