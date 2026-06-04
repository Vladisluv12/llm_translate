import { test, expect, Page } from '@playwright/test'
import { BROWSER_MOCK_SCRIPT } from './browser-mock'

async function openSettings(page: Page) {
  await page.addInitScript(BROWSER_MOCK_SCRIPT)
  await page.goto('/settings/settings.html')
  await page.waitForLoadState('networkidle')
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 1: Fields pre-populated from storage defaults
// ─────────────────────────────────────────────────────────────────────────────
test('settings fields pre-populated with defaults', async ({ page }) => {
  await openSettings(page)
  await expect(page.locator('#apiUrl')).toHaveValue('http://localhost:11434/v1/chat/completions')
  await expect(page.locator('#model')).toHaveValue('llama3.1')
  await expect(page.locator('#requestTimeout')).toHaveValue('120')
  await expect(page.locator('#maxRPS')).toHaveValue('5')
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 2: Save shows "Saved!" confirmation
// ─────────────────────────────────────────────────────────────────────────────
test('Save button shows Saved! confirmation', async ({ page }) => {
  await openSettings(page)
  await page.locator('#save').click()
  await expect(page.locator('#saved-msg')).toHaveText('Saved!')
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 3: Saved! message disappears after 2 seconds
// ─────────────────────────────────────────────────────────────────────────────
test('Saved! message clears automatically after 2s', async ({ page }) => {
  await openSettings(page)
  await page.locator('#save').click()
  await expect(page.locator('#saved-msg')).toHaveText('Saved!')
  await page.waitForTimeout(2200)
  await expect(page.locator('#saved-msg')).toHaveText('')
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 4: Model and URL changes are persisted
// ─────────────────────────────────────────────────────────────────────────────
test('changing model and URL persists to storage', async ({ page }) => {
  await openSettings(page)
  await page.locator('#model').fill('mistral-translate')
  await page.locator('#apiUrl').fill('http://localhost:11434/v1/chat/completions')
  await page.locator('#save').click()

  const stored = await page.evaluate(() => window.browser.storage.local._store)
  expect(stored.config?.model).toBe('mistral-translate')
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 5: NaN guard — clearing numeric field keeps previous value
// ─────────────────────────────────────────────────────────────────────────────
test('clearing numeric field keeps previous value instead of saving NaN', async ({ page }) => {
  await openSettings(page)
  await page.locator('#requestTimeout').fill('')
  await page.locator('#save').click()

  const stored = await page.evaluate(() => window.browser.storage.local._store)
  // Should remain 120 (default), not NaN
  expect(stored.config?.requestTimeout).toBe(120)
  expect(isNaN(stored.config?.requestTimeout)).toBe(false)
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 6: Temperature field accepts decimals
// ─────────────────────────────────────────────────────────────────────────────
test('temperature field accepts decimal values', async ({ page }) => {
  await openSettings(page)
  await page.locator('#temperature').fill('0.7')
  await page.locator('#save').click()

  const stored = await page.evaluate(() => window.browser.storage.local._store)
  expect(stored.config?.temperature).toBe(0.7)
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 7: AI Context-Aware checkbox toggles correctly
// ─────────────────────────────────────────────────────────────────────────────
test('AI Context-Aware checkbox saves boolean correctly', async ({ page }) => {
  await openSettings(page)
  await page.locator('#aiContextAware').check()
  await page.locator('#save').click()

  const stored = await page.evaluate(() => window.browser.storage.local._store)
  expect(stored.config?.aiContextAware).toBe(true)

  await page.locator('#aiContextAware').uncheck()
  await page.locator('#save').click()
  const stored2 = await page.evaluate(() => window.browser.storage.local._store)
  expect(stored2.config?.aiContextAware).toBe(false)
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 8: Source language dropdown saves correctly
// ─────────────────────────────────────────────────────────────────────────────
test('source language dropdown saves auto/en/zh', async ({ page }) => {
  await openSettings(page)
  for (const val of ['en', 'zh', 'auto']) {
    await page.locator('#sourceLang').selectOption(val)
    await page.locator('#save').click()
    const stored = await page.evaluate(() => window.browser.storage.local._store)
    expect(stored.config?.sourceLang).toBe(val)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 9: Prompt textareas are editable and save correctly
// ─────────────────────────────────────────────────────────────────────────────
test('custom system prompt is saved', async ({ page }) => {
  await openSettings(page)
  await page.locator('#systemPrompt').fill('You are a professional Russian translator.')
  await page.locator('#save').click()

  const stored = await page.evaluate(() => window.browser.storage.local._store)
  expect(stored.config?.systemPrompt).toBe('You are a professional Russian translator.')
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 10: Page layout doesn't overflow on 700px width
// ─────────────────────────────────────────────────────────────────────────────
test('settings page fits within 700px without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 900 })
  await openSettings(page)

  const hasOverflow = await page.evaluate(() => document.body.scrollWidth > document.body.clientWidth)
  expect(hasOverflow).toBe(false)
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 11: Clear all cache button shows confirmation then clears
// ─────────────────────────────────────────────────────────────────────────────
test('clear all cache button shows confirmation then clears', async ({ page }) => {
  await openSettings(page)
  const btn = page.locator('#btn-clear-all-cache')
  await expect(btn).toBeVisible()
  await btn.click()
  const status = page.locator('#clear-all-status')
  await expect(status).toHaveText('All translations cleared ✓')
  await page.waitForTimeout(2100)
  await expect(status).toHaveText('')
})
