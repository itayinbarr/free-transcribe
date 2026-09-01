import { expect, test } from '@playwright/test'

/**
 * Decoding is the one part of the pipeline that depends entirely on the
 * browser, so it is tested in a real browser against real container formats.
 * These import the app module directly, so no model is downloaded.
 */

const FORMATS = ['wav', 'mp3', 'm4a', 'ogg'] as const

test.describe('audio decoding', () => {
  for (const format of FORMATS) {
    test(`decodes ${format} to 16 kHz mono`, async ({ page }) => {
      await page.goto('/')
      const result = await page.evaluate(async (extension) => {
        // Built at runtime so TypeScript does not try to resolve a dev-server
        // URL against the project's module graph.
        const specifier = ['', 'src', 'lib', 'audio.ts'].join('/')
        const { decodeAudioFile, SAMPLE_RATE } = await import(specifier)
        const response = await fetch(`/tests/fixtures/sample-he.${extension}`)
        const blob = await response.blob()
        const file = new File([blob], `sample-he.${extension}`)
        const audio = await decodeAudioFile(file)
        let peak = 0
        for (let i = 0; i < audio.length; i += 97) peak = Math.max(peak, Math.abs(audio[i]))
        return { length: audio.length, sampleRate: SAMPLE_RATE, peak }
      }, format)

      // The fixture is 12 seconds; lossy formats pad or trim by a few frames.
      expect(result.length / result.sampleRate).toBeGreaterThan(11)
      expect(result.length / result.sampleRate).toBeLessThan(13)
      // Real speech, not silence.
      expect(result.peak).toBeGreaterThan(0.01)
    })
  }

  test('reports a useful error for a file that is not audio', async ({ page }) => {
    await page.goto('/')
    const message = await page.evaluate(async () => {
      const specifier = ['', 'src', 'lib', 'audio.ts'].join('/')
      const { decodeAudioFile } = await import(specifier)
      const file = new File([new Uint8Array([1, 2, 3, 4])], 'broken.wav')
      try {
        await decodeAudioFile(file)
        return 'no error'
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    })
    expect(message).toContain('broken.wav')
    expect(message).toMatch(/could not read/i)
  })
})
