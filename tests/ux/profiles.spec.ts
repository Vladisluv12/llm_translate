import { test, expect, Page } from '@playwright/test'
import { BROWSER_MOCK_SCRIPT } from './browser-mock'

async function openSettings(page: Page) {
  await page.addInitScript(BROWSER_MOCK_SCRIPT)
  await page.goto('/settings/settings.html')
  await page.waitForLoadState('networkidle')
}

async function openPopup(page: Page) {
  await page.addInitScript(BROWSER_MOCK_SCRIPT)
  await page.goto('/popup/popup.html')
  await page.waitForLoadState('networkidle')
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings: Profile list shows default profiles
// ─────────────────────────────────────────────────────────────────────────────
test('settings shows profile list with active marked', async ({ page }) => {
  await openSettings(page)
  const profileItems = page.locator('.profile-item')
  await expect(profileItems).toHaveCount(3)
  const active = page.locator('.profile-item.active')
  await expect(active).toHaveCount(1)
  await expect(active).toContainText('NVIDIA NIM')
})

// ─────────────────────────────────────────────────────────────────────────────
// Settings: Add new profile
// ─────────────────────────────────────────────────────────────────────────────
test('settings add profile and save to storage', async ({ page }) => {
  await openSettings(page)
  await page.locator('#btn-add-profile').click()
  await page.locator('#profile-name').fill('Test Profile')
  await page.locator('#profile-apiUrl').fill('http://test.local')
  await page.locator('#profile-model').fill('test-model')
  await page.locator('#btn-save-profile').click()

  const items = page.locator('.profile-item')
  await expect(items).toHaveCount(4)
  await expect(items.last()).toContainText('Test Profile')

  const stored = await page.evaluate(() => window.browser.storage.local._store)
  expect(stored.config?.profiles?.length).toBe(4)
})

// ─────────────────────────────────────────────────────────────────────────────
// Settings: Delete profile
// ─────────────────────────────────────────────────────────────────────────────
test('settings delete profile removes from list', async ({ page }) => {
  await openSettings(page)
  const deleteBtn = page.locator('.profile-item .btn-delete').first()
  await deleteBtn.click()
  await page.waitForTimeout(300)

  const items = page.locator('.profile-item')
  await expect(items).toHaveCount(2)
})

// ─────────────────────────────────────────────────────────────────────────────
// Popup: Profile dropdown contains profiles
// ─────────────────────────────────────────────────────────────────────────────
test('popup profile dropdown contains all profiles', async ({ page }) => {
  await openPopup(page)
  const options = await page.locator('#profile-select option').allTextContents()
  expect(options).toContain('NVIDIA NIM')
  expect(options).toContain('Llama Local (Ollama)')
  expect(options).toContain('Mistral Local (Ollama)')
})

// ─────────────────────────────────────────────────────────────────────────────
// Popup: Changing profile updates activeProfileId
// ─────────────────────────────────────────────────────────────────────────────
test('popup changing profile saves activeProfileId', async ({ page }) => {
  await openPopup(page)
  await page.locator('#profile-select').selectOption('llama-local')

  const stored = await page.evaluate(() => window.browser.storage.local._store)
  expect(stored.config?.activeProfileId).toBe('llama-local')
})
