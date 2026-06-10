import { test, expect, Page } from '@playwright/test'
import { BROWSER_MOCK_SCRIPT } from './browser-mock'

async function openArticle(page: Page) {
  await page.addInitScript(BROWSER_MOCK_SCRIPT)
  await page.goto('/fixtures/article.html')
  await page.waitForLoadState('networkidle')
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline panel: SELECTION_TRANSLATED message shows panel
// ─────────────────────────────────────────────────────────────────────────────
test('SELECTION_TRANSLATED shows inline panel with text', async ({ page }) => {
  await openArticle(page)
  await page.evaluate(() => {
    window.__mockBrowser.dispatch({
      type: 'SELECTION_TRANSLATED',
      originalText: 'Machine learning is a branch of artificial intelligence.',
      translatedText: 'Машинное обучение — это раздел искусственного интеллекта.',
      from: 'English',
      to: 'Russian',
    })
  })

  const panel = page.locator('#zt-inline-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('Machine learning')
  await expect(panel).toContainText('Машинное обучение')
})

// ─────────────────────────────────────────────────────────────────────────────
// Inline panel: Close button removes panel
// ─────────────────────────────────────────────────────────────────────────────
test('inline panel close button removes it', async ({ page }) => {
  await openArticle(page)
  await page.evaluate(() => {
    window.__mockBrowser.dispatch({
      type: 'SELECTION_TRANSLATED',
      originalText: 'Hello',
      translatedText: 'Привет',
      from: 'English',
      to: 'Russian',
    })
  })

  await page.locator('#zt-inline-close').click()
  await page.waitForTimeout(100)
  await expect(page.locator('#zt-inline-panel')).toBeHidden()
})
