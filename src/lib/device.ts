/**
 * Device capability checks.
 *
 * A 563 MB model has to be decompressed into GPU or system memory, and on a
 * phone that can get the tab killed outright rather than raising an error we
 * could catch. The honest thing is to say so before the download starts.
 */

/** Rough memory ceiling in GB. Chrome caps the reported value at 8. */
export function approximateMemoryGB(): number | undefined {
  const value = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return typeof value === 'number' ? value : undefined
}

export function isLikelyMobile(): boolean {
  const data = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
  if (typeof data?.mobile === 'boolean') return data.mobile
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

/**
 * Returns a warning to show before a download, or null when the device should
 * cope. Deliberately conservative: a wrong warning costs a sentence of reading,
 * a wrong silence costs the user a crashed tab after a 563 MB download.
 */
export function modelWarning(sizeMB: number): string | null {
  if (sizeMB < 250) return null

  const memory = approximateMemoryGB()
  if (isLikelyMobile()) {
    return (
      `This model needs about ${sizeMB} MB of download and a similar amount of memory. ` +
      'Phones and tablets often run out and reload the page part way through. ' +
      'A desktop browser is much more likely to finish.'
    )
  }
  if (memory !== undefined && memory <= 4) {
    return (
      `This device reports about ${memory} GB of memory, which may not be enough for a ` +
      `${sizeMB} MB model. If the page reloads itself, that is why.`
    )
  }
  return null
}
