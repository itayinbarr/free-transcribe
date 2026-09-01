/**
 * Minimum viable check: does the Hebrew ONNX export actually load and produce
 * Hebrew text? Run before building anything on top of it.
 *
 *   node scripts/smoke.ts <audio-file> [backend] [tier]
 */

import { loadAsr, transcribeBlock } from '../src/lib/asr.ts'
import { getAsrModel } from '../src/lib/models.ts'
import type { Backend, Tier } from '../src/lib/types.ts'
import { decodeToPcm } from './decode.ts'

const [file, backendArg = 'webgpu', tierArg = 'accurate'] = process.argv.slice(2)
const backend = backendArg as Backend
const tier = tierArg as Tier

const model = getAsrModel('he', tier)
console.log(`model=${model.id} backend=${backend} tier=${tier} (~${model.sizeMB} MB)`)

const audio = await decodeToPcm(file, { offset: 10, duration: 60 })
console.log(`audio: ${(audio.length / 16000).toFixed(1)}s`)

let lastPct = -1
const t0 = performance.now()
const transcriber = await loadAsr(model, backend, (p: Record<string, unknown>) => {
  if (p.status === 'progress' && typeof p.progress === 'number') {
    const pct = Math.floor(p.progress / 10) * 10
    if (pct !== lastPct) {
      lastPct = pct
      process.stdout.write(`\rdownload ${p.file}: ${pct}%   `)
    }
  }
})
console.log(`\nloaded in ${((performance.now() - t0) / 1000).toFixed(1)}s`)

const t1 = performance.now()
const chunks = await transcribeBlock(transcriber, audio, 'he')
const dt = (performance.now() - t1) / 1000
console.log(`transcribed 60s in ${dt.toFixed(1)}s (RTF ${(60 / dt).toFixed(1)}x)\n`)
for (const c of chunks) console.log(`[${c.timestamp[0]?.toFixed(1)}] ${c.text}`)
