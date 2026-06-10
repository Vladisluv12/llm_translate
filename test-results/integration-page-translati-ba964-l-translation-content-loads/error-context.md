# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: integration/page-translation.spec.ts >> scroll sync works correctly after real translation content loads
- Location: tests/ux/integration/page-translation.spec.ts:208:1

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 30
Received:   205.5
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]: Translation complete
  - generic [ref=e3]:
    - generic [ref=e4]: Машинное обучение является разделом искусственного интеллекта.
    - generic [ref=e5]: Он фокусируется на использовании данных и алгоритмов для улучшения точности.
    - generic [ref=e6]: Супервизированное обучение использует маркированные наборы данных для обучения алгоритмов.
    - generic [ref=e7]: Несупервизированное обучение использует алгоритмы для группировки немаркированных данных.
    - generic [ref=e8]: Нейронные сети имитируют операции человеческого мозга.
    - generic [ref=e9]: Глубокое обучение использует многослойные нейронные сети.
    - generic [ref=e10]: Конволюционные сети используются для анализа визуальной имиджерии.
    - generic [ref=e11]: Повторяющиеся сети обрабатывают временную последовательную информацию.
```

# Test source

```ts
  142 |   for (let i = 0; i < blocks.length; i++) {
  143 |     const translated = await translateText(blocks[i])
  144 |     await injectBlock(page, `zt-${i}`, blocks[i], translated)
  145 |     // Each block visible immediately after its translation arrives
  146 |     await expect(page.locator('#content .block')).toHaveCount(i + 1)
  147 |   }
  148 | 
  149 |   await page.evaluate(() => window.__mockBrowser.dispatch({ type: 'TRANSLATION_DONE' }))
  150 | 
  151 |   const elapsed = Date.now() - start
  152 |   expect(elapsed).toBeLessThan(30000)
  153 |   await expect(page.locator('#status')).toContainText('Translation complete')
  154 | })
  155 | 
  156 | // ─────────────────────────────────────────────────────────────────────────────
  157 | // SCENARIO 5: Extractor runs on real HTML article → translation window shows
  158 | // ─────────────────────────────────────────────────────────────────────────────
  159 | test('real article page extracted and first 3 paragraphs shown in translation window', async ({ browser }) => {
  160 |   test.setTimeout(60000)
  161 | 
  162 |   // Open article in one tab
  163 |   const articleCtx = await browser.newContext()
  164 |   const articlePage = await articleCtx.newPage()
  165 |   await articlePage.goto('/fixtures/article.html')
  166 |   await articlePage.waitForLoadState('domcontentloaded')
  167 | 
  168 |   // Extract text blocks from the article
  169 |   const blocks = await articlePage.evaluate(EXTRACT_SCRIPT) as Array<{ id: string; text: string }>
  170 |   expect(blocks.length).toBeGreaterThan(5)
  171 | 
  172 |   // Translate first 3 blocks
  173 |   const first3 = blocks.slice(0, 3)
  174 |   const translations = await translateBatch(first3)
  175 | 
  176 |   // Open translation window
  177 |   const translationCtx = await browser.newContext()
  178 |   const translationPage = await translationCtx.newPage()
  179 |   await translationPage.addInitScript(BROWSER_MOCK_SCRIPT)
  180 |   await translationPage.goto('/translation/translation.html?sourceTabId=1')
  181 |   await translationPage.waitForLoadState('networkidle')
  182 | 
  183 |   await translationPage.evaluate((total) => {
  184 |     window.__mockBrowser.dispatch({ type: 'TRANSLATION_PROGRESS', done: 0, total })
  185 |   }, blocks.length)
  186 | 
  187 |   // Feed translated blocks
  188 |   for (const block of first3) {
  189 |     const translated = translations.get(block.id) ?? block.text
  190 |     await translationPage.evaluate(({ id, originalText, translatedText }) => {
  191 |       window.__mockBrowser.dispatch({ type: 'TRANSLATION_BLOCK', block: { id, originalText, translatedText } })
  192 |     }, { id: block.id, originalText: block.text, translatedText: translated })
  193 |   }
  194 | 
  195 |   await expect(translationPage.locator('#content .block')).toHaveCount(3)
  196 | 
  197 |   const texts = await translationPage.locator('#content .block').allTextContents()
  198 |   const russianCount = texts.filter(t => /[а-яёА-ЯЁ]/.test(t)).length
  199 |   expect(russianCount).toBeGreaterThanOrEqual(2)
  200 | 
  201 |   await articleCtx.close()
  202 |   await translationCtx.close()
  203 | })
  204 | 
  205 | // ─────────────────────────────────────────────────────────────────────────────
  206 | // SCENARIO 6: Scroll sync after real translation — position preserved
  207 | // ─────────────────────────────────────────────────────────────────────────────
  208 | test('scroll sync works correctly after real translation content loads', async ({ page }) => {
  209 |   test.setTimeout(60000)
  210 |   await openTranslation(page)
  211 | 
  212 |   // Fill with real translations (batch of 8)
  213 |   const texts = [
  214 |     'Machine learning is a branch of artificial intelligence.',
  215 |     'It focuses on the use of data and algorithms to improve accuracy.',
  216 |     'Supervised learning uses labeled datasets to train algorithms.',
  217 |     'Unsupervised learning uses algorithms to cluster unlabeled data.',
  218 |     'Neural networks mimic operations of a human brain.',
  219 |     'Deep learning uses multi-layer neural networks.',
  220 |     'Convolutional networks are used for visual imagery analysis.',
  221 |     'Recurrent networks handle temporal sequence data.',
  222 |   ]
  223 |   const items = texts.map((t, i) => ({ id: `zt-${i}`, text: t }))
  224 |   const translations = await translateBatch(items)
  225 | 
  226 |   for (const item of items) {
  227 |     await injectBlock(page, item.id, item.text, translations.get(item.id) ?? item.text)
  228 |   }
  229 |   await page.evaluate(() => window.__mockBrowser.dispatch({ type: 'TRANSLATION_DONE' }))
  230 | 
  231 |   // Test scroll sync at 3 anchor positions
  232 |   for (const anchorId of ['zt-2', 'zt-5', 'zt-7']) {
  233 |     await page.evaluate((id) => window.__mockBrowser.dispatch({ type: 'SCROLL_SYNC', anchorId: id, anchorPx: 0 }), anchorId)
  234 |     await page.waitForTimeout(400)
  235 | 
  236 |     const top = await page.evaluate((id) => {
  237 |       const el = document.querySelector(`[data-zt-id="${id}"]`)
  238 |       return el ? el.getBoundingClientRect().top : null
  239 |     }, anchorId)
  240 |     if (top !== null) {
  241 |       expect(top).toBeGreaterThanOrEqual(-5)
> 242 |       expect(top).toBeLessThan(30)
      |                   ^ Error: expect(received).toBeLessThan(expected)
  243 |     }
  244 |   }
  245 | })
  246 | 
```