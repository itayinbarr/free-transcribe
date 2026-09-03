import { expect, test } from '@playwright/test'

test.describe('interface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('states the privacy guarantee up front', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'free-transcribe' })).toBeVisible()
    await expect(page.getByText(/audio never leaves your device/i)).toBeVisible()
  })

  test('offers two Hebrew models and three English ones', async ({ page }) => {
    // Hebrew has a purpose-trained small model and the large ivrit.ai one.
    // It still has no "Balanced" tier: stock whisper-small scores 46% on
    // Hebrew, so it would only be a bigger download of something worse.
    await expect(page.getByRole('button', { name: 'ivrit.ai Hebrew' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Fast (Hebrew)' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Balanced' })).toHaveCount(0)

    await page.getByRole('button', { name: 'English' }).click()
    for (const tier of ['Fast', 'Balanced', 'Accurate']) {
      await expect(page.getByRole('button', { name: tier })).toBeVisible()
    }
  })

  test('the small Hebrew model is a far smaller download', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Download the model/ })).toContainText('563 MB')
    await page.getByRole('button', { name: 'Fast (Hebrew)' }).click()
    await expect(page.getByRole('button', { name: /Download the model/ })).toContainText('160 MB')
  })

  test('shows the download size and updates it with the speaker toggle', async ({ page }) => {
    const button = page.getByRole('button', { name: /Download the model/ })
    await expect(button).toContainText('563 MB')
    await page.getByRole('checkbox').check()
    await expect(button).toContainText('579 MB')
  })

  test('accepts audio and video files in the picker', async ({ page }) => {
    const accept = await page.locator('input[type=file]').getAttribute('accept')
    expect(accept).toContain('audio/*')
    expect(accept).toContain('video/*')
    for (const extension of ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.mp4', '.mov']) {
      expect(accept).toContain(extension)
    }
    await expect(page.locator('input[type=file]')).toHaveAttribute('multiple', '')
  })

  test('locks the settings once the model starts loading', async ({ page }) => {
    await page.getByRole('button', { name: /Download the model/ }).click()
    await expect(page.getByText(/Settings are fixed/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'English' })).toBeDisabled()
  })

  test('reports which backend it got', async ({ page }) => {
    await page.getByRole('button', { name: /Download the model/ }).click()
    // Either message is correct; the point is that detection ran and said so.
    await expect(
      page.getByText(/Running on WebGPU|WebGPU is unavailable in this browser/),
    ).toBeVisible({ timeout: 30_000 })
  })
})

test.describe('large models on small devices', () => {
  test('warns a phone before a 563 MB download', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the warning is for phones and tablets')
    await page.goto('/')
    await expect(page.getByText(/Phones and tablets often run out/)).toBeVisible()
  })

  test('says nothing on a desktop', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktops should not see the warning')
    await page.goto('/')
    await expect(page.getByText(/Phones and tablets often run out/)).toHaveCount(0)
  })
})

test.describe('layout', () => {
  test('never scrolls sideways, down to a 320px screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto('/')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('keeps tap targets big enough on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    // Scoped to real buttons: Playwright maps the hidden file input to the
    // button role, and a visually hidden input is one pixel tall by design.
    const buttons = page.locator('button')
    const count = await buttons.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox()
      if (box) expect(box.height).toBeGreaterThanOrEqual(40)
    }
  })
})
