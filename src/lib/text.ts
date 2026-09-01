/** Text clean-up shared by the pipeline and the exporters. */

/**
 * Whisper degenerates into repeating one phrase when it is fed silence, music,
 * or speech it cannot model. Real speech does repeat, so the test is
 * deliberately strict: the same short phrase filling most of a long output.
 */
export function isDegenerate(text: string): boolean {
  const words = text.trim().split(/\s+/)
  if (words.length < 12) return false

  for (let size = 1; size <= 4; size++) {
    if (words.length < size * 6) continue
    const phrase = words.slice(0, size).join(' ')
    let repeats = 0
    for (let i = 0; i + size <= words.length; i += size) {
      if (words.slice(i, i + size).join(' ') === phrase) repeats++
      else break
    }
    if (repeats * size > words.length * 0.7) return true
  }

  // Also catch a phrase that starts repeating partway through the output.
  const seen = new Map<string, number>()
  for (const w of words) seen.set(w, (seen.get(w) ?? 0) + 1)
  const commonest = Math.max(...seen.values())
  return commonest > words.length * 0.6 && words.length > 20
}

/** Formats seconds as hh:mm:ss, dropping the hour when the file is short. */
export function formatTimecode(seconds: number, forceHours = false): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 || forceHours ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`
}

/** SRT wants hh:mm:ss,mmm with every field padded. */
export function formatSrtTime(seconds: number): string {
  const clamped = Math.max(0, seconds)
  const ms = Math.floor((clamped % 1) * 1000)
  const total = Math.floor(clamped)
  const h = String(Math.floor(total / 3600)).padStart(2, '0')
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${h}:${m}:${s},${String(ms).padStart(3, '0')}`
}

/** Default display name for a zero-based speaker index. */
export function speakerName(index: number): string {
  return `Speaker ${index + 1}`
}
