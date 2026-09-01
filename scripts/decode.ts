/**
 * Node-side audio decoding for the benchmark harness. The browser uses the Web
 * Audio API instead (src/lib/audio.ts); this exists so the harness can feed the
 * same Float32Array into the same pipeline code.
 */

import { spawn } from 'node:child_process'

export const SAMPLE_RATE = 16000

export interface DecodeOptions {
  /** Seconds to skip from the start. */
  offset?: number
  /** Seconds to keep. Omit for the whole file. */
  duration?: number
}

export function decodeToPcm(path: string, opts: DecodeOptions = {}): Promise<Float32Array> {
  const args = ['-v', 'error', '-nostdin']
  if (opts.offset) args.push('-ss', String(opts.offset))
  args.push('-i', path)
  if (opts.duration) args.push('-t', String(opts.duration))
  args.push('-f', 'f32le', '-ac', '1', '-ar', String(SAMPLE_RATE), '-')

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args)
    const parts: Buffer[] = []
    let stderr = ''
    proc.stdout.on('data', (d: Buffer) => parts.push(d))
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited ${code}: ${stderr}`))
      const buf = Buffer.concat(parts)
      // Buffer may not be 4-byte aligned into its pool, so copy when needed.
      const aligned =
        buf.byteOffset % 4 === 0
          ? new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4)
          : new Float32Array(new Uint8Array(buf).buffer)
      resolve(aligned)
    })
  })
}

export function probeDuration(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=nw=1:nk=1',
      path,
    ])
    let out = ''
    proc.stdout.on('data', (d: Buffer) => (out += d.toString()))
    proc.on('error', reject)
    proc.on('close', () => resolve(parseFloat(out.trim())))
  })
}
