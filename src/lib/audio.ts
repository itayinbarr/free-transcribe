/**
 * Browser-side audio decoding. Runs on the main thread because AudioContext is
 * not exposed to workers; the resulting Float32Array is transferred to the
 * worker, so nothing is copied twice.
 */

export const SAMPLE_RATE = 16000

/**
 * Everything the file picker accepts. The browser decodes far more than this
 * list suggests (any container it can play), so the list is generous and the
 * real check happens at decode time.
 */
export const ACCEPTED_EXTENSIONS = [
  '.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.oga', '.opus', '.webm',
  '.mp4', '.m4b', '.m4v', '.mov', '.mkv', '.avi', '.wma', '.amr', '.3gp', '.aiff', '.aif', '.caf',
]

export const ACCEPT_ATTRIBUTE = `audio/*,video/*,${ACCEPTED_EXTENSIONS.join(',')}`

/** Container formats the Web Audio API generally cannot open by itself. */
const NEEDS_TRANSCODE = /\.(mkv|avi|wma|amr|3gp|wmv|flv|ts|mpg|mpeg)$/i

export class AudioDecodeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AudioDecodeError'
  }
}

/**
 * Decodes a file to mono 16 kHz PCM.
 *
 * Asking the AudioContext for 16 kHz makes it resample while decoding, so a
 * 47-minute recording lands as ~180 MB instead of ~540 MB at the source rate.
 */
export async function decodeAudioFile(
  file: Blob,
  onStatus?: (message: string) => void,
): Promise<Float32Array> {
  const name = 'name' in file ? String((file as File).name) : ''
  const buffer = await file.arrayBuffer()

  if (!NEEDS_TRANSCODE.test(name)) {
    try {
      return await decodeWithWebAudio(buffer)
    } catch (error) {
      onStatus?.('Format needs converting, loading the converter')
      return transcodeThenDecode(buffer, name, error)
    }
  }

  onStatus?.('Converting audio')
  return transcodeThenDecode(buffer, name)
}

async function decodeWithWebAudio(buffer: ArrayBuffer): Promise<Float32Array> {
  const Ctx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  // Safari rejects unusual rates on a live context; OfflineAudioContext accepts
  // 16 kHz everywhere and never touches the speakers.
  const context = new Ctx({ sampleRate: SAMPLE_RATE })
  try {
    const decoded = await context.decodeAudioData(buffer)
    return toMono(decoded)
  } finally {
    await context.close().catch(() => undefined)
  }
}

function toMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0)
  const length = buffer.length
  const out = new Float32Array(length)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) out[i] += data[i]
  }
  for (let i = 0; i < length; i++) out[i] /= buffer.numberOfChannels
  return out
}

/**
 * Last resort for containers the browser will not open: ffmpeg.wasm, fetched
 * from a CDN only when it is actually needed. It is LGPL, so it is never
 * bundled into this MIT-licensed app (see NOTICE).
 */
async function transcodeThenDecode(
  buffer: ArrayBuffer,
  name: string,
  originalError?: unknown,
): Promise<Float32Array> {
  try {
    const wav = await transcodeToWav(buffer, name)
    return await decodeWithWebAudio(wav)
  } catch (error) {
    throw new AudioDecodeError(
      `This browser could not read "${name || 'the file'}". Try converting it to WAV, MP3 or M4A first.`,
      { cause: originalError ?? error },
    )
  }
}

const FFMPEG_VERSION = '0.12.15'
const FFMPEG_CORE_VERSION = '0.12.10'

async function transcodeToWav(buffer: ArrayBuffer, name: string): Promise<ArrayBuffer> {
  const { FFmpeg } = await import(
    /* @vite-ignore */ `https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/+esm`
  )
  const base = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`
  const ffmpeg = new FFmpeg()
  await ffmpeg.load({ coreURL: `${base}/ffmpeg-core.js`, wasmURL: `${base}/ffmpeg-core.wasm` })

  const input = `input${(name.match(/\.[^.]+$/) ?? ['.bin'])[0]}`
  await ffmpeg.writeFile(input, new Uint8Array(buffer))
  await ffmpeg.exec(['-i', input, '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'wav', 'out.wav'])
  const data: Uint8Array = await ffmpeg.readFile('out.wav')
  await ffmpeg.terminate()
  return data.buffer as ArrayBuffer
}

/** Human-readable file size for the UI. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
