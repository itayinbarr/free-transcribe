import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

/**
 * Drives the real interface with the small Hebrew model, end to end.
 *
 * This exists because two bugs shipped that a direct call to the transformers.js
 * pipeline could not have caught. The first was an fp16 decoder ONNX Runtime
 * refuses to load; the second was the worker's preload passing Whisper's
 * language and task arguments to a monolingual model. Both only appear when the
 * app's own code path runs, so the test clicks through the app rather than
 * importing its parts.
 *
 * It downloads 160 MB, so it is opt-in:
 *   E2E_MODEL=1 npx playwright test hebrew-model --project=desktop
 */
test.skip(!process.env.E2E_MODEL, 'set E2E_MODEL=1 to run the model download test')
test.setTimeout(15 * 60 * 1000)

// Both Hebrew models this project trained, through the real interface.
for (const tier of ['Fast (Hebrew)', 'Balanced (Hebrew)']) {
  test(`the ${tier} tier loads and transcribes through the interface`, async ({ page }) => {
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(String(error)))

  await page.goto('/')
  await page.getByRole('button', { name: tier }).click()

  const fixture = fileURLToPath(new URL('../fixtures/sample-he.wav', import.meta.url))
  await page.locator('input[type=file]').setInputFiles(fixture)

  // The failure both bugs produced: a red panel instead of a transcript.
  await expect(page.getByText('The model could not be loaded.')).toHaveCount(0)

  // Surface the job's own error rather than timing out on a missing "Done",
  // which says only that something went wrong somewhere.
  const failed = page.getByText('Failed', { exact: false })
  const done = page.getByText('Done', { exact: false })
  await expect(done.or(failed).first()).toBeVisible({ timeout: 13 * 60 * 1000 })
  if (await failed.count()) {
    const message = await page.locator('article p').allInnerTexts()
    throw new Error(`the job failed: ${message.join(' | ')}`)
  }
  await expect(page.getByText('The model could not be loaded.')).toHaveCount(0)

  // Hebrew script actually reached the transcript. The first paragraph in the
  // card is its metadata line, so check that some paragraph carries Hebrew.
  const paragraphs = await page.locator('article p').allInnerTexts()
  expect(paragraphs.join('\n')).toMatch(/[֐-׿]/)
  expect(failures).toEqual([])
  })
}
