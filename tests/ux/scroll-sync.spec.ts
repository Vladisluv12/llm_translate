import { test, expect, Page } from '@playwright/test'
import { BROWSER_MOCK_SCRIPT } from './browser-mock'

async function openSettings(page: Page) {
  await page.addInitScript(BROWSER_MOCK_SCRIPT)
  await page.goto('/settings/settings.html')
  await page.waitForLoadState('networkidle')
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings: Scroll sync checkbox saves correctly
// ─────────────────────────────────────────────────────────────────────────────
test('settings scrollSyncEnabled checkbox saves boolean', async ({ page }) => {
  await openSettings(page)
  await page.locator('#scrollSyncEnabled').uncheck()
  await page.locator('#save').click()

  const stored = await page.evaluate(() => window.browser.storage.local._store)
  expect(stored.config?.scrollSyncEnabled).toBe(false)

  await page.locator('#scrollSyncEnabled').check()
  await page.locator('#save').click()
  const stored2 = await page.evaluate(() => window.browser.storage.local._store)
  expect(stored2.config?.scrollSyncEnabled).toBe(true)
})
