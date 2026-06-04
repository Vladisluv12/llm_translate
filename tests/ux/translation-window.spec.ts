import { test, expect, Page } from '@playwright/test'
import { BROWSER_MOCK_SCRIPT } from './browser-mock'

async function openTranslationPage(page: Page, sourceTabId = 42) {
  await page.addInitScript(BROWSER_MOCK_SCRIPT)
  await page.goto(`/translation/translation.html?sourceTabId=${sourceTabId}`)
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

async function sendProgress(page: Page, done: number, total: number) {
  await page.evaluate(({ done, total }) => {
    window.__mockBrowser.dispatch({ type: 'TRANSLATION_PROGRESS', done, total })
  }, { done, total })
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 1: Blocks appear in order as translation arrives
// ─────────────────────────────────────────────────────────────────────────────
test('blocks appear incrementally as translation arrives', async ({ page }) => {
  await openTranslationPage(page)

  // Initially no blocks, status shows waiting
  await expect(page.locator('#status')).toHaveText('Waiting for translation...')
  await expect(page.locator('#content')).toBeEmpty()

  // Send 3 blocks with 200ms gap — simulating streaming
  for (let i = 0; i < 3; i++) {
    await sendProgress(page, i, 3)
    await sendBlock(page, `zt-${i}`, `Переведённый параграф ${i + 1}`)
    await page.waitForTimeout(200)
    const blocks = page.locator('#content .block')
    await expect(blocks).toHaveCount(i + 1)
  }

  // All 3 blocks visible with correct text
  const blocks = page.locator('#content .block')
  await expect(blocks).toHaveCount(3)
  await expect(blocks.nth(0)).toContainText('Переведённый параграф 1')
  await expect(blocks.nth(2)).toContainText('Переведённый параграф 3')
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 2: Progress counter updates correctly
// ─────────────────────────────────────────────────────────────────────────────
test('progress counter shows X / Y and resets to complete', async ({ page }) => {
  await openTranslationPage(page)

  await sendProgress(page, 0, 20)
  await expect(page.locator('#status')).toContainText('0 / 20')

  await sendProgress(page, 10, 20)
  await expect(page.locator('#status')).toContainText('10 / 20')

  await page.evaluate(() => window.__mockBrowser.dispatch({ type: 'TRANSLATION_DONE' }))
  await expect(page.locator('#status')).toContainText('Translation complete')
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 3: Error message shown in status bar
// ─────────────────────────────────────────────────────────────────────────────
test('error message appears in status bar', async ({ page }) => {
  await openTranslationPage(page)
  await page.evaluate(() => {
    window.__mockBrowser.dispatch({ type: 'TRANSLATION_ERROR', message: 'Could not access this page.' })
  })
  await expect(page.locator('#status')).toContainText('Error: Could not access this page.')
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 4: Scroll sync — translation window scrolls when source scrolls
// ─────────────────────────────────────────────────────────────────────────────
test('SCROLL_SYNC message moves window scroll position', async ({ page }) => {
  await openTranslationPage(page)

  for (let i = 0; i < 30; i++) {
    await sendBlock(page, `zt-${i}`, `Параграф ${i + 1} — достаточно длинный текст для создания прокрутки страницы в браузере.`)
  }
  await page.evaluate(() => window.__mockBrowser.dispatch({ type: 'TRANSLATION_DONE' }))

  await page.evaluate(() => {
    window.__mockBrowser.dispatch({ type: 'SCROLL_SYNC', anchorId: 'zt-15', anchorPx: 0 })
  })
  await page.waitForTimeout(150)

  const top = await page.evaluate(() => {
    const el = document.querySelector('[data-zt-id="zt-15"]')!
    return el.getBoundingClientRect().top
  })
  // Element should be at the very top of viewport (±5px tolerance)
  expect(top).toBeGreaterThanOrEqual(-5)
  expect(top).toBeLessThan(20)
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 5: Scroll sync at different window sizes
// ─────────────────────────────────────────────────────────────────────────────
// Sizes based on actual 1920x1080 display:
// - full split: 960x1080 (default viewport in config)
// - narrow: browser sidebar open, translation panel narrower
// - zen sidebar: Zen has a left sidebar ~220px, so translation panel ≈ 740px
for (const [label, size] of [
  ['zen-sidebar (740px wide)', { width: 740, height: 1080 }],
  ['split half (960px wide)', { width: 960, height: 1080 }],
  ['slightly resized (820px wide)', { width: 820, height: 1080 }],
] as const) {
  test(`scroll sync works at ${label}`, async ({ page }) => {
    await page.setViewportSize(size)
    await openTranslationPage(page)

    for (let i = 0; i < 25; i++) {
      await sendBlock(page, `zt-${i}`, `Параграф ${i + 1} — длинный текст для проверки скролла.`)
    }

    for (const anchorId of ['zt-6', 'zt-18', 'zt-24']) {
      await page.evaluate((id) => window.__mockBrowser.dispatch({ type: 'SCROLL_SYNC', anchorId: id, anchorPx: 0 }), anchorId)
      await page.waitForTimeout(200)

      const top = await page.evaluate((id) => {
        const el = document.querySelector(`[data-zt-id="${id}"]`)
        return el ? el.getBoundingClientRect().top : null
      }, anchorId)
      if (top !== null) {
        expect(top).toBeGreaterThanOrEqual(-5)
        expect(top).toBeLessThan(30)
      }
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 6: Highlight follows scroll position
// ─────────────────────────────────────────────────────────────────────────────
test('closest block gets highlight class on scroll sync', async ({ page }) => {
  await openTranslationPage(page)
  for (let i = 0; i < 20; i++) {
    await sendBlock(page, `zt-${i}`, `Параграф ${i + 1}`)
  }

  // Scroll to near top
  await page.evaluate(() => window.__mockBrowser.dispatch({ type: 'SCROLL_SYNC', anchorId: 'zt-1', anchorPx: 0 }))
  await page.waitForTimeout(400)
  const highlightedCount = await page.locator('#content .block.highlight').count()
  expect(highlightedCount).toBe(1)
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 7: User scroll in translation window sends message back
// ─────────────────────────────────────────────────────────────────────────────
test('scrolling translation window does NOT send SCROLL_SYNC back (source-driven only)', async ({ page }) => {
  await openTranslationPage(page, 42)
  for (let i = 0; i < 30; i++) {
    await sendBlock(page, `zt-${i}`, `Параграф ${i + 1} — текст`)
  }

  await page.evaluate(() => window.scrollTo({ top: 500 }))
  await page.waitForTimeout(200)

  const sent = await page.evaluate(() => window.__mockBrowser.sentMessages)
  const scrollMsgs = sent.filter((m: any) => m.msg?.type === 'SCROLL_SYNC')
  // Scroll sync is source-driven — translation window must NOT send scroll back
  expect(scrollMsgs.length).toBe(0)
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 8: Dark mode — block highlight color changes
// ─────────────────────────────────────────────────────────────────────────────
test('dark mode applies correct background styles', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await openTranslationPage(page)
  await sendBlock(page, 'zt-1', 'Тёмный режим работает')

  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  // dark mode body background should not be white
  expect(bg).not.toBe('rgb(255, 255, 255)')
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 9: Timing — 50 blocks, measure total render time
// ─────────────────────────────────────────────────────────────────────────────
test('renders 50 blocks without visible jank (< 3s total)', async ({ page }) => {
  await openTranslationPage(page)
  const start = Date.now()

  for (let i = 0; i < 50; i++) {
    await sendBlock(page, `zt-${i}`, `Переведённый параграф номер ${i + 1} с нормальным текстом`)
  }
  await page.evaluate(() => window.__mockBrowser.dispatch({ type: 'TRANSLATION_DONE' }))

  const elapsed = Date.now() - start
  await expect(page.locator('#content .block')).toHaveCount(50)
  expect(elapsed).toBeLessThan(3000)
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 10: Same block ID updated (not duplicated)
// ─────────────────────────────────────────────────────────────────────────────
test('sending same block ID twice updates text, not duplicates', async ({ page }) => {
  await openTranslationPage(page)
  await sendBlock(page, 'zt-1', 'Первый вариант перевода')
  await sendBlock(page, 'zt-1', 'Обновлённый вариант перевода')

  await expect(page.locator('#content .block')).toHaveCount(1)
  await expect(page.locator('#content .block')).toContainText('Обновлённый вариант перевода')
})
