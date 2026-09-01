import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

/**
 * The full path: pick a file, download a model, transcribe, export.
 *
 * This downloads about 110 MB, so it is opt-in:
 *   E2E_MODEL=1 npx playwright test transcribe --project=desktop
 */
test.skip(!process.env.E2E_MODEL, 'set E2E_MODEL=1 to run the full model test')

test('transcribes a file and offers every export', async ({ page }) => {
  await page.goto('/')

  // The smallest model, so the test does not download 563 MB.
  await page.getByRole('button', { name: 'English' }).click()
  await page.getByRole('button', { name: 'Fast' }).click()

  const fixture = fileURLToPath(new URL('../fixtures/sample-he.mp3', import.meta.url))
  await page.locator('input[type=file]').setInputFiles(fixture)

  await expect(page.getByText('Downloading the model')).toBeVisible()
  await expect(page.getByText(/Transcribing|Telling the speakers apart/)).toBeVisible({
    timeout: 15 * 60 * 1000,
  })

  await expect(page.getByText('Done')).toBeVisible({ timeout: 15 * 60 * 1000 })

  for (const label of ['Copy', 'TXT', 'Markdown', 'SRT', 'PDF']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
  }

  // Each export must actually produce a file, PDF included: that path embeds a
  // font and reorders Hebrew, so it is the one most likely to break silently.
  for (const label of ['TXT', 'Markdown', 'SRT', 'PDF']) {
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
    await page.getByRole('button', { name: label, exact: true }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/sample-he\.(txt|md|srt|pdf)$/)
  }
})
