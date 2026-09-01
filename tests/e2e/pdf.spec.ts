import { expect, test } from '@playwright/test'

/**
 * PDF export needs a browser (jsPDF, fetch for the font), so it is tested here
 * rather than in the unit suite.
 */

const IMPORT_PDF = ['', 'src', 'lib', 'pdf.ts'].join('/')

test.describe('Hebrew PDF export', () => {
  test('keeps Latin runs intact inside a right-to-left line', async ({ page }) => {
    await page.goto('/')
    const reordered = await page.evaluate(async (specifier) => {
      const { toVisualOrder } = await import(specifier)
      return toVisualOrder('מה הצווארי בקבוק שיש לנו? Check Point 2026.', true)
    }, IMPORT_PDF)

    // The bug this guards: a bidi pass that reverses the whole line turns
    // "Check Point 2026" into "6202 tnioP kcehC".
    expect(reordered).toContain('Check Point 2026')
    expect(reordered).not.toContain('tnioP')
  })

  test('reverses Hebrew into visual order', async ({ page }) => {
    await page.goto('/')
    const reordered = await page.evaluate(async (specifier) => {
      const { toVisualOrder } = await import(specifier)
      return toVisualOrder('שלום עולם', true)
    }, IMPORT_PDF)
    expect(reordered).toBe('םלוע םולש')
  })

  test('produces a real PDF for a Hebrew transcript', async ({ page }) => {
    await page.goto('/')
    const info = await page.evaluate(async (specifier) => {
      const { toPdf } = await import(specifier)
      const blob = await toPdf(
        {
          language: 'he',
          duration: 65,
          elapsed: 5,
          speakerCount: 2,
          segments: [
            { start: 0, end: 5, text: 'שלום, קוראים לי איתי.', speaker: 0 },
            { start: 5, end: 12, text: 'מה הצווארי בקבוק? Check Point 2026.', speaker: 1 },
          ],
        },
        { title: 'בדיקה' },
      )
      const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer())
      return { size: blob.size, type: blob.type, magic: String.fromCharCode(...head) }
    }, IMPORT_PDF)

    expect(info.magic).toBe('%PDF-')
    expect(info.type).toBe('application/pdf')
    // A page with an embedded font subset is comfortably over 10 KB.
    expect(info.size).toBeGreaterThan(10_000)
  })
})
