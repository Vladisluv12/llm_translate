# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: profiles.spec.ts >> settings shows profile list with active marked
- Location: tests/ux/profiles.spec.ts:19:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('.profile-item')
Expected: 3
Received: 0
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for locator('.profile-item')
    14 × locator resolved to 0 elements
       - unexpected value "0"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - heading "Zen Translate Settings" [level=1] [ref=e2]
  - heading "Provider" [level=2] [ref=e3]
  - generic [ref=e4]:
    - generic [ref=e5]: API URL
    - textbox "API URL" [ref=e6]: http://localhost:11434/v1/chat/completions
  - generic [ref=e7]:
    - generic [ref=e8]: API Key
    - textbox "API Key" [ref=e9]:
      - /placeholder: Leave empty for Ollama
  - generic [ref=e10]:
    - generic [ref=e11]: Model
    - textbox "Model" [ref=e12]: llama3.1
  - generic [ref=e13]:
    - generic [ref=e14]: Temperature
    - spinbutton "Temperature" [ref=e15]: "0.1"
  - generic [ref=e16]:
    - generic [ref=e17]: Request Timeout (seconds)
    - spinbutton "Request Timeout (seconds)" [ref=e18]: "120"
  - generic [ref=e19]:
    - generic [ref=e20]: Max Requests Per Second
    - spinbutton "Max Requests Per Second" [ref=e21]: "5"
  - generic [ref=e22]:
    - generic [ref=e23]: Max Text Length Per Request (chars)
    - spinbutton "Max Text Length Per Request (chars)" [ref=e24]: "1800"
  - generic [ref=e25]:
    - generic [ref=e26]: Max Paragraphs Per Request
    - spinbutton "Max Paragraphs Per Request" [ref=e27]: "10"
  - heading "Prompts" [level=2] [ref=e28]
  - paragraph [ref=e29]: "Variables: {{from}}, {{to}}, {{text}}, {{json}}, {{imt_title}}, {{imt_theme}}"
  - generic [ref=e30]:
    - generic [ref=e31]: System Prompt
    - textbox "System Prompt" [ref=e32]: You are a translator.
  - generic [ref=e33]:
    - generic [ref=e34]: Multiple Prompt (batched)
    - textbox "Multiple Prompt (batched)" [ref=e35]: "Translate {{from}} to {{to}}: {{json}}"
  - generic [ref=e36]:
    - generic [ref=e37]: Single Prompt
    - textbox "Single Prompt" [ref=e38]: "Translate {{from}} to {{to}}: {{text}}"
  - heading "Features" [level=2] [ref=e39]
  - generic [ref=e40]:
    - checkbox "Enable AI Context-Aware Makes a pre-pass to extract page topic and key terms for more consistent translations." [ref=e41]
    - text: Enable AI Context-Aware
    - paragraph [ref=e42]: Makes a pre-pass to extract page topic and key terms for more consistent translations.
  - heading "Languages" [level=2] [ref=e43]
  - generic [ref=e44]:
    - generic [ref=e45]: Source Language
    - combobox "Source Language" [ref=e46]:
      - option "Auto-detect" [selected]
      - option "English"
      - option "Chinese"
  - heading "Hotkey" [level=2] [ref=e47]
  - paragraph [ref=e48]:
    - text: "Default:"
    - strong [ref=e49]: Alt+A
    - text: . Change in
    - link "browser extension shortcuts" [ref=e50] [cursor=pointer]:
      - /url: "#"
    - text: .
  - heading "Cache" [level=2] [ref=e51]
  - paragraph [ref=e52]: Translations are stored locally. Cached pages load instantly on revisit.
  - button "Clear all cached translations" [ref=e53]
  - heading "Debug Logs" [level=2] [ref=e54]
  - paragraph [ref=e55]: Last 500 log entries from all extension contexts (background, popup, translation window).
  - generic [ref=e56]:
    - button "Copy logs" [ref=e57] [cursor=pointer]
    - button "Clear logs" [ref=e58] [cursor=pointer]
  - textbox [ref=e59]: (no logs yet)
  - button "Save Settings" [ref=e60] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect, Page } from '@playwright/test'
  2  | import { BROWSER_MOCK_SCRIPT } from './browser-mock'
  3  | 
  4  | async function openSettings(page: Page) {
  5  |   await page.addInitScript(BROWSER_MOCK_SCRIPT)
  6  |   await page.goto('/settings/settings.html')
  7  |   await page.waitForLoadState('networkidle')
  8  | }
  9  | 
  10 | async function openPopup(page: Page) {
  11 |   await page.addInitScript(BROWSER_MOCK_SCRIPT)
  12 |   await page.goto('/popup/popup.html')
  13 |   await page.waitForLoadState('networkidle')
  14 | }
  15 | 
  16 | // ─────────────────────────────────────────────────────────────────────────────
  17 | // Settings: Profile list shows default profiles
  18 | // ─────────────────────────────────────────────────────────────────────────────
  19 | test('settings shows profile list with active marked', async ({ page }) => {
  20 |   await openSettings(page)
  21 |   const profileItems = page.locator('.profile-item')
> 22 |   await expect(profileItems).toHaveCount(3)
     |                              ^ Error: expect(locator).toHaveCount(expected) failed
  23 |   const active = page.locator('.profile-item.active')
  24 |   await expect(active).toHaveCount(1)
  25 |   await expect(active).toContainText('NVIDIA NIM')
  26 | })
  27 | 
  28 | // ─────────────────────────────────────────────────────────────────────────────
  29 | // Settings: Add new profile
  30 | // ─────────────────────────────────────────────────────────────────────────────
  31 | test('settings add profile and save to storage', async ({ page }) => {
  32 |   await openSettings(page)
  33 |   await page.locator('#btn-add-profile').click()
  34 |   await page.locator('#profile-name').fill('Test Profile')
  35 |   await page.locator('#profile-apiUrl').fill('http://test.local')
  36 |   await page.locator('#profile-model').fill('test-model')
  37 |   await page.locator('#btn-save-profile').click()
  38 | 
  39 |   const items = page.locator('.profile-item')
  40 |   await expect(items).toHaveCount(4)
  41 |   await expect(items.last()).toContainText('Test Profile')
  42 | 
  43 |   const stored = await page.evaluate(() => window.browser.storage.local._store)
  44 |   expect(stored.config?.profiles?.length).toBe(4)
  45 | })
  46 | 
  47 | // ─────────────────────────────────────────────────────────────────────────────
  48 | // Settings: Delete profile
  49 | // ─────────────────────────────────────────────────────────────────────────────
  50 | test('settings delete profile removes from list', async ({ page }) => {
  51 |   await openSettings(page)
  52 |   const deleteBtn = page.locator('.profile-item .btn-delete').first()
  53 |   await deleteBtn.click()
  54 |   await page.waitForTimeout(300)
  55 | 
  56 |   const items = page.locator('.profile-item')
  57 |   await expect(items).toHaveCount(2)
  58 | })
  59 | 
  60 | // ─────────────────────────────────────────────────────────────────────────────
  61 | // Popup: Profile dropdown contains profiles
  62 | // ─────────────────────────────────────────────────────────────────────────────
  63 | test('popup profile dropdown contains all profiles', async ({ page }) => {
  64 |   await openPopup(page)
  65 |   const options = await page.locator('#profile-select option').allTextContents()
  66 |   expect(options).toContain('NVIDIA NIM')
  67 |   expect(options).toContain('Llama Local (Ollama)')
  68 |   expect(options).toContain('Mistral Local (Ollama)')
  69 | })
  70 | 
  71 | // ─────────────────────────────────────────────────────────────────────────────
  72 | // Popup: Changing profile updates activeProfileId
  73 | // ─────────────────────────────────────────────────────────────────────────────
  74 | test('popup changing profile saves activeProfileId', async ({ page }) => {
  75 |   await openPopup(page)
  76 |   await page.locator('#profile-select').selectOption('llama-local')
  77 | 
  78 |   const stored = await page.evaluate(() => window.browser.storage.local._store)
  79 |   expect(stored.config?.activeProfileId).toBe('llama-local')
  80 | })
  81 | 
```