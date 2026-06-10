import { test, expect, Page } from '@playwright/test'
import { BROWSER_MOCK_SCRIPT } from './browser-mock'

async function openTranslationPage(page: Page) {
  await page.addInitScript(BROWSER_MOCK_SCRIPT)
  await page.goto('/translation/translation.html?sourceTabId=42')
  await page.waitForLoadState('networkidle')
}

async function sendBlock(page: Page, id: string, text: string) {
  await page.evaluate(({ id, text }) => {
    window.__mockBrowser.dispatch({
      type: 'TRANSLATION_BLOCK',
      block: { id, originalText: 'original', translatedText: text },
    })
  }, { id, text })
}

// ─────────────────────────────────────────────────────────────────────────────
// Translation window: CLICK_SYNC scrolls to block
// ─────────────────────────────────────────────────────────────────────────────
test('CLICK_SYNC scrolls translation window to block', async ({ page }) => {
  await openTranslationPage(page)
  for (let i = 0; i < 20; i++) {
    await sendBlock(page, `zt-${i}`, `Paragraph ${i + 1} with enough text to make the page scrollable in the browser for testing purposes.`)
  }
  await page.evaluate(() => window.__mockBrowser.dispatch({ type: 'TRANSLATION_DONE' }))

  await page.evaluate(() => {
    window.__mockBrowser.dispatch({ type: 'CLICK_SYNC', anchorId: 'zt-10' })
  })
  await page.waitForTimeout(200)

  const top = await page.evaluate(() => {
    const el = document.querySelector('[data-zt-id="zt-10"]')
    return el ? el.getBoundingClientRect().top : null
  })
  expect(top).not.toBeNull()
  expect(top!).toBeGreaterThanOrEqual(-5)
  expect(top!).toBeLessThan(50)
})

// ─────────────────────────────────────────────────────────────────────────────
// Translation window: Click on block sends CLICK_SYNC_BACK
// ─────────────────────────────────────────────────────────────────────────────
test('clicking block sends CLICK_SYNC_BACK to source tab', async ({ page }) => {
  await openTranslationPage(page)
  await sendBlock(page, 'zt-1', 'Test paragraph')
  await page.evaluate(() => window.__mockBrowser.dispatch({ type: 'TRANSLATION_DONE' }))

  await page.locator('[data-zt-id="zt-1"]').click()
  await page.waitForTimeout(100)

  const sent = await page.evaluate(() => window.__mockBrowser.sentMessages)
  const clickBack = sent.filter((m: any) => m.msg?.type === 'CLICK_SYNC_BACK')
  expect(clickBack.length).toBeGreaterThanOrEqual(1)
})
