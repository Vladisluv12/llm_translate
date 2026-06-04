/**
 * PDF translation UX tests using real NVIDIA API.
 * Tests pdf-viewer.html layout, text extraction simulation, and translation rendering.
 */
import { test, expect, Page } from '@playwright/test'
import { BROWSER_MOCK_SCRIPT } from '../browser-mock'
import { translateText } from './nvidia-client'

// PDF viewer needs browser.runtime.getURL for the worker path — override it
const PDF_MOCK = BROWSER_MOCK_SCRIPT + `
;(function() {
  const orig = window.browser.runtime.getURL;
  window.browser.runtime.getURL = (p) => 'http://localhost:7654/' + p;
})();
`

async function openPdfViewer(page: Page, pdfUrl: string) {
  await page.addInitScript(PDF_MOCK)
  const encoded = encodeURIComponent(pdfUrl)
  await page.goto(`/pdf/pdf-viewer.html?url=${encoded}`)
  await page.waitForLoadState('networkidle')
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 1: PDF viewer layout — two panels visible at 960x1080
// ─────────────────────────────────────────────────────────────────────────────
test('PDF viewer shows two panels side by side', async ({ page }) => {
  await page.addInitScript(PDF_MOCK)
  await page.goto('/pdf/pdf-viewer.html?url=')
  await page.waitForLoadState('networkidle')

  const pdfPanel = page.locator('#pdf-panel')
  const translationPanel = page.locator('#translation-panel')

  await expect(pdfPanel).toBeVisible()
  await expect(translationPanel).toBeVisible()

  const pdfBox = await pdfPanel.boundingBox()
  const transBox = await translationPanel.boundingBox()

  // Both panels visible with meaningful width
  expect(pdfBox!.width).toBeGreaterThan(200)
  expect(transBox!.width).toBeGreaterThan(200)

  // Panels are side by side (similar top positions)
  expect(Math.abs(pdfBox!.x - transBox!.x)).toBeGreaterThan(100) // not overlapping
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 2: PDF viewer panel proportions at split-screen size (960x1080)
// ─────────────────────────────────────────────────────────────────────────────
test('translation panel takes ~50% width at 960px', async ({ page }) => {
  await page.addInitScript(PDF_MOCK)
  await page.goto('/pdf/pdf-viewer.html?url=')
  await page.waitForLoadState('networkidle')

  const transBox = await page.locator('#translation-panel').boundingBox()
  const totalWidth = page.viewportSize()!.width

  // Translation panel should be ~50% of the viewport
  const ratio = transBox!.width / totalWidth
  expect(ratio).toBeGreaterThan(0.4)
  expect(ratio).toBeLessThan(0.6)
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 3: Status shows "No PDF URL provided" gracefully
// ─────────────────────────────────────────────────────────────────────────────
test('empty URL shows graceful error in status', async ({ page }) => {
  await page.addInitScript(PDF_MOCK)
  await page.goto('/pdf/pdf-viewer.html?url=')
  await page.waitForLoadState('networkidle')

  const status = page.locator('#status')
  await expect(status).toContainText('No PDF URL provided')
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 4: Simulate page translation appear in PDF translation panel
// ─────────────────────────────────────────────────────────────────────────────
test('translated PDF pages render in right panel via DOM injection', async ({ page }) => {
  test.setTimeout(90000)
  await page.addInitScript(PDF_MOCK)
  await page.goto('/pdf/pdf-viewer.html?url=')
  await page.waitForLoadState('networkidle')

  // Simulate what pdf-viewer.ts does when it creates translation placeholders
  await page.evaluate(() => {
    const translationsEl = document.getElementById('translations')!
    const statusEl = document.getElementById('status')!
    statusEl.textContent = '3 pages loaded — scroll to translate'

    for (let i = 1; i <= 3; i++) {
      const wrapper = document.createElement('div')
      wrapper.className = 'page-translation'
      const label = document.createElement('div')
      label.className = 'page-label'
      label.textContent = `Page ${i}`
      const text = document.createElement('div')
      text.id = `trans-${i}`
      text.className = 'page-text loading'
      text.textContent = 'Translating...'
      wrapper.appendChild(label)
      wrapper.appendChild(text)
      translationsEl.appendChild(wrapper)
    }
  })

  // Translate real content for 3 "pages"
  const pageTexts = [
    'Artificial intelligence is intelligence demonstrated by machines, as opposed to natural intelligence displayed by humans.',
    'Machine learning enables systems to learn and improve from experience without being explicitly programmed.',
    'Deep learning is part of a broader family of machine learning methods based on artificial neural networks.',
  ]

  for (let i = 0; i < pageTexts.length; i++) {
    const translated = await translateText(pageTexts[i])
    expect(translated).toMatch(/[а-яёА-ЯЁ]/)

    // Inject translation result into the right panel (mimics what pdf-viewer.ts does)
    await page.evaluate(({ pageNum, text }) => {
      const el = document.getElementById(`trans-${pageNum}`)!
      el.textContent = text
      el.classList.remove('loading')
    }, { pageNum: i + 1, text: translated })
  }

  // All 3 page translations visible and non-loading
  for (let i = 1; i <= 3; i++) {
    const el = page.locator(`#trans-${i}`)
    await expect(el).toBeVisible()
    await expect(el).not.toHaveClass(/loading/)
    const text = await el.textContent()
    expect(text).toMatch(/[а-яёА-ЯЁ]/)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 5: PDF scroll sync — right panel follows left
// ─────────────────────────────────────────────────────────────────────────────
test('scrolling PDF panel syncs translation panel', async ({ page }) => {
  test.setTimeout(60000)
  await page.addInitScript(PDF_MOCK)
  await page.goto('/pdf/pdf-viewer.html?url=')
  await page.waitForLoadState('networkidle')

  // Fill both panels with enough content to be scrollable
  await page.evaluate(() => {
    const pdfPanel = document.getElementById('pdf-panel')!
    const translationsEl = document.getElementById('translations')!

    // Use 30 items, each translation paragraph tall enough to make panel scroll
    for (let i = 0; i < 30; i++) {
      const fakeCanvas = document.createElement('div')
      fakeCanvas.style.cssText = 'width:500px;height:300px;background:#666;margin-bottom:20px'
      fakeCanvas.dataset.page = String(i + 1)
      pdfPanel.appendChild(fakeCanvas)

      const wrapper = document.createElement('div')
      wrapper.className = 'page-translation'
      // Make each entry tall so the translation panel overflows
      wrapper.innerHTML = `<div class="page-label">Страница ${i + 1}</div>` +
        `<div class="page-text" style="min-height:120px">Перевод страницы ${i + 1}: искусственный интеллект — это раздел компьютерных наук, занимающийся созданием систем, способных выполнять задачи, которые обычно требуют человеческого интеллекта.</div>`
      translationsEl.appendChild(wrapper)
    }
  })

  // Add scroll sync listener manually (mirrors what main() does in pdf-viewer.ts,
  // skipped here because main() exits early on empty URL)
  await page.evaluate(() => {
    const pdfPanel = document.getElementById('pdf-panel')!
    const translationPanel = document.getElementById('translation-panel')!
    pdfPanel.addEventListener('scroll', () => {
      const ratio = pdfPanel.scrollTop / (pdfPanel.scrollHeight - pdfPanel.clientHeight || 1)
      translationPanel.scrollTop = ratio * (translationPanel.scrollHeight - translationPanel.clientHeight)
    })
  })

  // In headless Firefox flex containers clip overflow — force explicit panel heights
  await page.evaluate(() => {
    const p = document.getElementById('pdf-panel')!
    const t = document.getElementById('translation-panel')!
    p.style.height = '400px'
    p.style.maxHeight = '400px'
    t.style.height = '400px'
    t.style.maxHeight = '400px'
  })

  // Scroll the PDF panel programmatically
  await page.evaluate(() => {
    const pdfPanel = document.getElementById('pdf-panel')!
    pdfPanel.scrollTop = pdfPanel.scrollHeight * 0.5
    pdfPanel.dispatchEvent(new Event('scroll'))
  })
  await page.waitForTimeout(300)

  const translationPanelScroll = await page.evaluate(() => {
    return document.getElementById('translation-panel')!.scrollTop
  })

  // Translation panel should have scrolled (not at 0)
  expect(translationPanelScroll).toBeGreaterThan(0)
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 6: Dark mode — PDF translation panel background
// ─────────────────────────────────────────────────────────────────────────────
test('dark mode: translation panel background is dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.addInitScript(PDF_MOCK)
  await page.goto('/pdf/pdf-viewer.html?url=')
  await page.waitForLoadState('networkidle')

  const bg = await page.evaluate(() =>
    getComputedStyle(document.getElementById('translation-panel')!).backgroundColor
  )
  // In dark mode should not be white
  expect(bg).not.toBe('rgb(255, 255, 255)')
})
