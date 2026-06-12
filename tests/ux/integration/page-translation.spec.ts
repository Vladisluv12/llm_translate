/**
 * End-to-end translation tests using real NVIDIA API.
 * Tests the full UX flow: extract text → translate → render in translation window.
 * API calls happen on the Node.js side; results are injected into the browser.
 */
import { test, expect, Page } from '@playwright/test'
import { BROWSER_MOCK_SCRIPT } from '../browser-mock'
import { translateText, translateBatch } from './nvidia-client'

// Extractor logic (mirrors src/content/extractor.ts) run inside the browser
const EXTRACT_SCRIPT = `
  Array.from(document.querySelectorAll('p, h1, h2, h3, h4, li')).filter(el => {
    const t = el.textContent?.trim() ?? '';
    return t.split(/\\s+/).filter(w => w.length > 0).length >= 3;
  }).map((el, i) => ({ id: 'zt-' + i, text: el.textContent?.trim() ?? '' }));
`

async function openTranslation(page: Page) {
  await page.addInitScript(BROWSER_MOCK_SCRIPT)
  await page.goto('/translation/translation.html?sourceTabId=1')
  await page.waitForLoadState('networkidle')
}

async function injectBlock(page: Page, id: string, originalText: string, translatedText: string) {
  await page.evaluate(({ id, originalText, translatedText }) => {
    window.__mockBrowser.dispatch({
      type: 'TRANSLATION_BLOCK',
      block: { id, originalText, translatedText },
    })
  }, { id, originalText, translatedText })
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 1: Single paragraph EN→RU — verify it's actually Russian
// ─────────────────────────────────────────────────────────────────────────────
test('single EN paragraph translates to Russian and renders correctly', async ({ page }) => {
  await openTranslation(page)

  const original = 'Machine learning is a branch of artificial intelligence that focuses on the use of data and algorithms to improve accuracy.'
  const translated = await translateText(original)

  // Should contain Cyrillic characters
  expect(translated).toMatch(/[а-яёА-ЯЁ]/)
  expect(translated.length).toBeGreaterThan(10)

  await injectBlock(page, 'zt-0', original, translated)
  await page.evaluate(() => window.__mockBrowser.dispatch({ type: 'TRANSLATION_DONE' }))

  await expect(page.locator('#content .block')).toHaveCount(1)
  await expect(page.locator('#content .block')).not.toHaveClass(/loading/)
  // Verify Russian text is visible in DOM
  const text = await page.locator('#content .block').textContent()
  expect(text).toMatch(/[а-яёА-ЯЁ]/)
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 2: Full article (10 paragraphs) — all render, progress updates
// ─────────────────────────────────────────────────────────────────────────────
test('10-paragraph article translates completely with correct progress', async ({ page }) => {
  await openTranslation(page)

  // Use fixture article text
  const paragraphs = [
    'Machine learning is a branch of artificial intelligence and computer science.',
    'Machine learning is an important component of the growing field of data science.',
    'Through the use of statistical methods, algorithms are trained to make classifications or predictions.',
    'These insights drive decision making within applications and businesses.',
    'Supervised learning uses labeled datasets to train algorithms to classify data accurately.',
    'Unsupervised learning uses algorithms to analyze and cluster unlabeled datasets.',
    'Reinforcement learning is based on rewarding desired behaviors and punishing undesired ones.',
    'Neural networks are algorithms that mimic operations of a human brain.',
    'Deep learning is part of a broader family of machine learning methods.',
    'Convolutional neural networks are most commonly applied to analyzing visual imagery.',
  ]

  await page.evaluate((total) => {
    window.__mockBrowser.dispatch({ type: 'TRANSLATION_PROGRESS', done: 0, total })
  }, paragraphs.length)

  // Translate batch
  const items = paragraphs.map((text, i) => ({ id: `zt-${i}`, text }))
  const translations = await translateBatch(items)

  // Feed blocks into translation window one by one (simulating streaming)
  for (let i = 0; i < paragraphs.length; i++) {
    const translated = translations.get(`zt-${i}`) ?? paragraphs[i]
    await injectBlock(page, `zt-${i}`, paragraphs[i], translated)
    await page.evaluate(({ done, total }) => {
      window.__mockBrowser.dispatch({ type: 'TRANSLATION_PROGRESS', done, total })
    }, { done: i + 1, total: paragraphs.length })
  }

  await page.evaluate(() => window.__mockBrowser.dispatch({ type: 'TRANSLATION_DONE' }))

  // All 10 blocks visible
  await expect(page.locator('#content .block')).toHaveCount(10)
  await expect(page.locator('#status')).toContainText('Translation complete')

  // At least 8 of 10 contain Cyrillic (allow 2 failures from model)
  const texts = await page.locator('#content .block').allTextContents()
  const russianCount = texts.filter(t => /[а-яёА-ЯЁ]/.test(t)).length
  expect(russianCount).toBeGreaterThanOrEqual(8)
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 3: Chinese → Russian translation
// ─────────────────────────────────────────────────────────────────────────────
test('Chinese paragraph translates to Russian correctly', async ({ page }) => {
  await openTranslation(page)

  const original = '机器学习是人工智能和计算机科学的一个分支，专注于使用数据和算法来模仿人类的学习方式，逐步提高其准确性。'
  const translated = await translateText(original, 'Chinese', 'Russian')

  expect(translated).toMatch(/[а-яёА-ЯЁ]/)

  await injectBlock(page, 'zt-0', original, translated)
  await page.evaluate(() => window.__mockBrowser.dispatch({ type: 'TRANSLATION_DONE' }))

  const text = await page.locator('#content .block').textContent()
  expect(text).toMatch(/[а-яёА-ЯЁ]/)
  // Should NOT still contain Chinese characters (proper translation happened)
  expect(text).not.toMatch(/[一-鿿]/)
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 4: Translation timing — 5 blocks appear within 30s total
// ─────────────────────────────────────────────────────────────────────────────
test('5 blocks translate and render within 30 seconds', async ({ page }) => {
  test.setTimeout(60000)
  await openTranslation(page)

  const blocks = [
    'Artificial intelligence is intelligence demonstrated by machines.',
    'Machine learning enables systems to learn from experience without being explicitly programmed.',
    'Deep learning uses neural networks with many layers to analyze patterns in data.',
    'Natural language processing is a subfield of AI that focuses on language understanding.',
    'Computer vision is a field of AI that enables computers to interpret visual information.',
  ]

  const start = Date.now()

  for (let i = 0; i < blocks.length; i++) {
    const translated = await translateText(blocks[i])
    await injectBlock(page, `zt-${i}`, blocks[i], translated)
    // Each block visible immediately after its translation arrives
    await expect(page.locator('#content .block')).toHaveCount(i + 1)
  }

  await page.evaluate(() => window.__mockBrowser.dispatch({ type: 'TRANSLATION_DONE' }))

  const elapsed = Date.now() - start
  expect(elapsed).toBeLessThan(30000)
  await expect(page.locator('#status')).toContainText('Translation complete')
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 5: Extractor runs on real HTML article → translation window shows
// ─────────────────────────────────────────────────────────────────────────────
test('real article page extracted and first 3 paragraphs shown in translation window', async ({ browser }) => {
  test.setTimeout(60000)

  // Open article in one tab
  const articleCtx = await browser.newContext()
  const articlePage = await articleCtx.newPage()
  await articlePage.goto('/fixtures/article.html')
  await articlePage.waitForLoadState('domcontentloaded')

  // Extract text blocks from the article
  const blocks = await articlePage.evaluate(EXTRACT_SCRIPT) as Array<{ id: string; text: string }>
  expect(blocks.length).toBeGreaterThan(5)

  // Translate first 3 blocks
  const first3 = blocks.slice(0, 3)
  const translations = await translateBatch(first3)

  // Open translation window
  const translationCtx = await browser.newContext()
  const translationPage = await translationCtx.newPage()
  await translationPage.addInitScript(BROWSER_MOCK_SCRIPT)
  await translationPage.goto('/translation/translation.html?sourceTabId=1')
  await translationPage.waitForLoadState('networkidle')

  await translationPage.evaluate((total) => {
    window.__mockBrowser.dispatch({ type: 'TRANSLATION_PROGRESS', done: 0, total })
  }, blocks.length)

  // Feed translated blocks
  for (const block of first3) {
    const translated = translations.get(block.id) ?? block.text
    await translationPage.evaluate(({ id, originalText, translatedText }) => {
      window.__mockBrowser.dispatch({ type: 'TRANSLATION_BLOCK', block: { id, originalText, translatedText } })
    }, { id: block.id, originalText: block.text, translatedText: translated })
  }

  await expect(translationPage.locator('#content .block')).toHaveCount(3)

  const texts = await translationPage.locator('#content .block').allTextContents()
  const russianCount = texts.filter(t => /[а-яёА-ЯЁ]/.test(t)).length
  expect(russianCount).toBeGreaterThanOrEqual(2)

  await articleCtx.close()
  await translationCtx.close()
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 6: Scroll sync after real translation — position preserved
// ─────────────────────────────────────────────────────────────────────────────
test('scroll sync works correctly after real translation content loads', async ({ page }) => {
  test.setTimeout(60000)
  await openTranslation(page)

  // Fill with real translations (batch of 8)
  const texts = [
    'Machine learning is a branch of artificial intelligence.',
    'It focuses on the use of data and algorithms to improve accuracy.',
    'Supervised learning uses labeled datasets to train algorithms.',
    'Unsupervised learning uses algorithms to cluster unlabeled data.',
    'Neural networks mimic operations of a human brain.',
    'Deep learning uses multi-layer neural networks.',
    'Convolutional networks are used for visual imagery analysis.',
    'Recurrent networks handle temporal sequence data.',
  ]
  const items = texts.map((t, i) => ({ id: `zt-${i}`, text: t }))
  const translations = await translateBatch(items)

  for (const item of items) {
    await injectBlock(page, item.id, item.text, translations.get(item.id) ?? item.text)
  }
  await page.evaluate(() => window.__mockBrowser.dispatch({ type: 'TRANSLATION_DONE' }))

  // Test scroll sync at 3 anchor positions
  for (const anchorId of ['zt-2', 'zt-5', 'zt-7']) {
    await page.evaluate((id) => window.__mockBrowser.dispatch({ type: 'SCROLL_SYNC', anchorId: id, anchorPx: 0 }), anchorId)
    await page.waitForTimeout(400)

    const top = await page.evaluate((id) => {
      const el = document.querySelector(`[data-zt-id="${id}"]`)
      return el ? el.getBoundingClientRect().top : null
    }, anchorId)
    if (top !== null) {
      expect(top).toBeGreaterThanOrEqual(-5)
      // Tolerance is large because translated text length varies per language
      expect(top).toBeLessThan(600)
    }
  }
})
