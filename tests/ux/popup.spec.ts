import { test, expect, Page } from '@playwright/test'
import { BROWSER_MOCK_SCRIPT } from './browser-mock'

async function openPopup(page: Page, isPdf = false) {
  await page.addInitScript(BROWSER_MOCK_SCRIPT)
  if (isPdf) {
    // Simulate PDF tab
    await page.addInitScript(`
      window.browser.tabs.query = () => Promise.resolve([{id:1, url:'https://example.com/paper.pdf'}])
    `)
  }
  await page.goto('/popup/popup.html')
  await page.waitForLoadState('networkidle')
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 1: Default popup state
// ─────────────────────────────────────────────────────────────────────────────
test('popup shows Translate Page button and settings link', async ({ page }) => {
  await openPopup(page)
  await expect(page.locator('#btn-translate')).toBeVisible()
  await expect(page.locator('#btn-translate')).toBeEnabled()
  await expect(page.locator('#settings-link')).toBeVisible()
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 2: PDF button hidden on regular pages
// ─────────────────────────────────────────────────────────────────────────────
test('PDF button is hidden on non-PDF page', async ({ page }) => {
  await openPopup(page)
  await expect(page.locator('#btn-pdf')).toBeHidden()
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 3: PDF button visible on PDF pages
// ─────────────────────────────────────────────────────────────────────────────
test('PDF button appears when current tab is a PDF', async ({ page }) => {
  await openPopup(page, true)
  await expect(page.locator('#btn-pdf')).toBeVisible()
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 4: Model dropdown is pre-populated
// ─────────────────────────────────────────────────────────────────────────────
test('model dropdown contains llama3.1 and mistral:7b', async ({ page }) => {
  await openPopup(page)
  const options = await page.locator('#model-select option').allTextContents()
  expect(options).toContain('llama3.1')
  expect(options).toContain('mistral:7b')
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 5: Click Translate Page → sends START_TRANSLATION message and closes
// ─────────────────────────────────────────────────────────────────────────────
test('Translate Page button sends START_TRANSLATION message', async ({ page }) => {
  await openPopup(page)
  await page.addInitScript(`
    window.browser.runtime.sendMessage = (msg) => {
      window.__sentMsg = msg;
      return Promise.resolve();
    };
    window.close = () => { window.__closed = true; };
  `)
  await page.goto('/popup/popup.html')
  await page.waitForLoadState('networkidle')
  await page.locator('#btn-translate').click()

  const msg = await page.evaluate(() => (window as any).__sentMsg)
  expect(msg?.type).toBe('START_TRANSLATION')
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 6: Button disables after click (prevent double-click)
// ─────────────────────────────────────────────────────────────────────────────
test('Translate button disables immediately after click', async ({ page }) => {
  await openPopup(page)
  await page.addInitScript(`
    window.browser.runtime.sendMessage = () => new Promise(() => {}); // never resolves
    window.close = () => {};
  `)
  await page.goto('/popup/popup.html')
  await page.waitForLoadState('networkidle')
  await page.locator('#btn-translate').click()
  await expect(page.locator('#btn-translate')).toBeDisabled()
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 7: Progress message updates the progress label
// ─────────────────────────────────────────────────────────────────────────────
test('TRANSLATION_PROGRESS message updates progress text', async ({ page }) => {
  await openPopup(page)
  await page.evaluate(() => {
    window.__mockBrowser.dispatch({ type: 'TRANSLATION_PROGRESS', done: 7, total: 23 })
  })
  await expect(page.locator('#progress')).toContainText('7 / 23')
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 8: TRANSLATION_DONE re-enables button and shows Done
// ─────────────────────────────────────────────────────────────────────────────
test('TRANSLATION_DONE re-enables button and shows Done', async ({ page }) => {
  await openPopup(page)
  await page.evaluate(() => {
    window.__mockBrowser.dispatch({ type: 'TRANSLATION_PROGRESS', done: 1, total: 5 })
  })
  await page.evaluate(() => {
    window.__mockBrowser.dispatch({ type: 'TRANSLATION_DONE' })
  })
  await expect(page.locator('#progress')).toContainText('Done')
  await expect(page.locator('#btn-translate')).toBeEnabled()
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 9: Changing model in dropdown saves config
// ─────────────────────────────────────────────────────────────────────────────
test('changing model dropdown saves to storage', async ({ page }) => {
  await openPopup(page)
  await page.locator('#model-select').selectOption('mistral:7b')

  const stored = await page.evaluate(() => window.browser.storage.local._store)
  expect(stored.config?.model).toBe('mistral:7b')
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 10: Popup fits in standard 280px width without overflow
// ─────────────────────────────────────────────────────────────────────────────
test('popup content fits in 280px without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 280, height: 400 })
  await openPopup(page)

  const hasOverflow = await page.evaluate(() => document.body.scrollWidth > document.body.clientWidth)
  expect(hasOverflow).toBe(false)
})
