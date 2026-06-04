# Scroll Sync — Anchor-Based Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace broken/ratio-based scroll sync with paragraph-level anchor sync for both website translation and PDF viewer.

**Architecture:** The content script finds the topmost visible `[data-zt-id]` element on scroll (rAF-throttled) and sends `SCROLL_SYNC { anchorId, anchorPx }` via `runtime.sendMessage`; the translation window scrolls that element to `offsetTop - anchorPx`. PDF viewer does the same locally (no message passing) using `[data-page]` canvases and `#trans-N` elements.

**Tech Stack:** TypeScript, Firefox WebExtension MV3, Vitest (unit), Playwright (UX/integration)

---

## File Map

| File | Change |
|------|--------|
| `src/shared/messages.ts` | Replace `ratio: number` with `anchorId: string; anchorPx: number` in `SCROLL_SYNC` |
| `src/content/content.ts` | Remove dead reverse-sync listener; add forward `scroll` listener with rAF throttle |
| `src/translation/translation.ts` | Update `SCROLL_SYNC` handler: `blocks.get(anchorId)` + `offsetTop - anchorPx`, drop ratio math |
| `src/pdf/pdf-viewer.ts` | Replace ratio-based scroll block with anchor-based inside `main()` |
| `tests/ux/translation-window.spec.ts` | Update 3 tests that dispatch `ratio`-format `SCROLL_SYNC` |
| `tests/ux/integration/page-translation.spec.ts` | Update scroll sync integration test |

---

### Task 1: Create feature branch

**Files:** (git only)

- [ ] **Step 1: Create and switch to feature branch**

```bash
git checkout -b feature/scroll-sync-anchor
```

Expected: `Switched to a new branch 'feature/scroll-sync-anchor'`

---

### Task 2: Update `SCROLL_SYNC` message type

**Files:**
- Modify: `src/shared/messages.ts:11`

- [ ] **Step 1: Replace `ratio` payload with `anchorId` + `anchorPx`**

In `src/shared/messages.ts`, find the line:
```ts
  | { type: 'SCROLL_SYNC'; ratio: number }
```
Replace with:
```ts
  | { type: 'SCROLL_SYNC'; anchorId: string; anchorPx: number }
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run lint
```

Expected: errors about `ratio` used in `content.ts` and `translation.ts` — that's correct, those files are next.

- [ ] **Step 3: Commit**

```bash
git add src/shared/messages.ts
git commit -m "feat: SCROLL_SYNC payload — anchorId + anchorPx instead of ratio"
```

---

### Task 3: Update translation window tests (TDD — write failing tests first)

**Files:**
- Modify: `tests/ux/translation-window.spec.ts:80-153`

- [ ] **Step 1: Update `SCROLL_SYNC message moves window scroll position` test (line 80)**

Replace the entire test body with:
```ts
async ({ page }) => {
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
}
```

- [ ] **Step 2: Update `closest block gets highlight class on scroll sync` test (line 142)**

Replace the `dispatch` call inside that test:
```ts
// was:
await page.evaluate(() => window.__mockBrowser.dispatch({ type: 'SCROLL_SYNC', ratio: 0.05 }))
// replace with:
await page.evaluate(() => window.__mockBrowser.dispatch({ type: 'SCROLL_SYNC', anchorId: 'zt-1', anchorPx: 0 }))
```

- [ ] **Step 3: Update `scroll sync works at ${label}` viewport tests (line 116)**

Replace the inner loop that dispatches ratio-format messages:
```ts
// was:
for (const ratio of [0.25, 0.75, 1.0]) {
  await page.evaluate((r) => window.__mockBrowser.dispatch({ type: 'SCROLL_SYNC', ratio: r }), ratio)
  await page.waitForTimeout(350)

  const scrollY = await page.evaluate(() => window.scrollY)
  const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
  if (maxScroll > 0) {
    const actual = scrollY / maxScroll
    expect(actual).toBeGreaterThan(ratio - 0.15)
    expect(actual).toBeLessThan(ratio + 0.15)
  }
}

// replace with:
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
```

- [ ] **Step 4: Run the updated tests — expect failure**

```bash
npx playwright test tests/ux/translation-window.spec.ts --reporter=line
```

Expected: tests fail because `translation.ts` still reads `msg.ratio` (TypeScript error or wrong scroll behavior).

---

### Task 4: Update `translation.ts` — new `SCROLL_SYNC` handler

**Files:**
- Modify: `src/translation/translation.ts:42-59` (SCROLL_SYNC block inside `onMessage` callback)

- [ ] **Step 1: Replace ratio-based scroll with anchor-based**

Find the block starting with:
```ts
  if (msg.type === 'SCROLL_SYNC' && msg.ratio !== undefined) {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: msg.ratio * maxScroll, behavior: 'smooth' })
```

Replace the entire `if (msg.type === 'SCROLL_SYNC' ...)` block with:
```ts
  if (msg.type === 'SCROLL_SYNC') {
    const el = blocks.get(msg.anchorId)
    if (!el) return

    window.scrollTo({ top: el.offsetTop - msg.anchorPx })

    // Highlight the block closest to viewport center
    let closest: HTMLElement | null = null
    let closestDist = Infinity
    for (const el of blocks.values()) {
      const rect = el.getBoundingClientRect()
      const dist = Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2)
      if (dist < closestDist) { closestDist = dist; closest = el }
    }
    if (closest) {
      for (const el of blocks.values()) el.classList.remove('highlight')
      closest.classList.add('highlight')
    }
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run lint
```

Expected: errors only from `content.ts` (still uses old signature). `translation.ts` and `messages.ts` should be clean.

- [ ] **Step 3: Run translation window tests — expect pass**

```bash
npx playwright test tests/ux/translation-window.spec.ts --reporter=line
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/translation/translation.ts tests/ux/translation-window.spec.ts
git commit -m "feat: anchor-based SCROLL_SYNC in translation window"
```

---

### Task 5: Update `content.ts` — add scroll listener, remove dead reverse-sync code

**Files:**
- Modify: `src/content/content.ts` (full rewrite — short file)

- [ ] **Step 1: Replace entire file content**

The current file has `__ztExtract` (lines 3–4) and a reverse-sync `onMessage` listener (lines 7–12) that is now dead code. Replace the whole file:

```ts
import { extractTextBlocks } from './extractor'

;(window as any).__ztExtract =
  () => extractTextBlocks(document.body).map(b => ({ id: b.id, text: b.text }))

let rafPending = false
window.addEventListener('scroll', () => {
  if (rafPending) return
  rafPending = true
  requestAnimationFrame(() => {
    rafPending = false
    const elements = document.querySelectorAll<HTMLElement>('[data-zt-id]')
    for (const el of elements) {
      const rect = el.getBoundingClientRect()
      if (rect.bottom > 0) {
        browser.runtime.sendMessage({
          type: 'SCROLL_SYNC',
          anchorId: el.dataset.ztId!,
          anchorPx: Math.max(0, -rect.top),
        })
        break
      }
    }
  })
}, { passive: true })
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/content/content.ts
git commit -m "feat: content script sends anchor-based SCROLL_SYNC on source page scroll"
```

---

### Task 6: Update `pdf-viewer.ts` — anchor-based scroll sync

**Files:**
- Modify: `src/pdf/pdf-viewer.ts` — scroll sync block at end of `main()` (~lines 155–161)

- [ ] **Step 1: Replace ratio-based scroll block**

Find this block inside `main()`:
```ts
  // Sync scroll between panels
  pdfPanel.addEventListener('scroll', () => {
    const ratio = pdfPanel.scrollTop / (pdfPanel.scrollHeight - pdfPanel.clientHeight || 1)
    translationPanel.scrollTop = ratio * (translationPanel.scrollHeight - translationPanel.clientHeight)
  })
```

Replace with:
```ts
  // Sync scroll between panels — anchor-based
  let pdfRafPending = false
  pdfPanel.addEventListener('scroll', () => {
    if (pdfRafPending) return
    pdfRafPending = true
    requestAnimationFrame(() => {
      pdfRafPending = false
      const pdfPanelTop = pdfPanel.getBoundingClientRect().top
      const pageEls = pdfPanel.querySelectorAll<HTMLElement>('[data-page]')
      for (const pageEl of pageEls) {
        const rect = pageEl.getBoundingClientRect()
        if (rect.bottom > pdfPanelTop) {
          const pageNum = parseInt(pageEl.dataset.page!, 10)
          const anchorPx = Math.max(0, pdfPanelTop - rect.top)
          const transEl = document.getElementById(`trans-${pageNum}`)
          if (transEl) translationPanel.scrollTop = transEl.offsetTop - anchorPx
          break
        }
      }
    })
  }, { passive: true })
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Build and do a quick sanity check**

```bash
npm run build
```

Expected: build completes without errors.

- [ ] **Step 4: Commit**

```bash
git add src/pdf/pdf-viewer.ts
git commit -m "feat: anchor-based scroll sync in PDF viewer"
```

---

### Task 7: Update integration test

**Files:**
- Modify: `tests/ux/integration/page-translation.spec.ts:207-244` (`scroll sync works correctly` test)

- [ ] **Step 1: Replace ratio-based dispatch with anchor-based**

Find the loop inside `test('scroll sync works correctly after real translation content loads')`:
```ts
  // Now test scroll sync at 3 positions
  for (const ratio of [0.3, 0.6, 0.9]) {
    await page.evaluate((r) => window.__mockBrowser.dispatch({ type: 'SCROLL_SYNC', ratio: r }), ratio)
    await page.waitForTimeout(400)

    const scrollY = await page.evaluate(() => window.scrollY)
    const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)

    if (maxScroll > 10) {
      const actual = scrollY / maxScroll
      expect(actual).toBeGreaterThan(ratio - 0.2)
      expect(actual).toBeLessThan(ratio + 0.2)
    }
  }
```

Replace with (blocks are `zt-0` through `zt-7`):
```ts
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
      expect(top).toBeLessThan(30)
    }
  }
```

- [ ] **Step 2: Run unit + UX tests (non-integration)**

```bash
npx playwright test tests/ux/translation-window.spec.ts tests/ux/popup.spec.ts tests/ux/settings.spec.ts --reporter=line
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add tests/ux/integration/page-translation.spec.ts
git commit -m "test: update scroll sync integration test to anchor-based format"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run all non-integration tests**

```bash
npx vitest run && npx playwright test tests/ux/ --ignore=tests/ux/integration --reporter=line
```

Expected: all pass.

- [ ] **Step 2: Build final dist**

```bash
npm run build
```

Expected: no errors, `dist/` updated.

- [ ] **Step 3: Summary commit if any stragglers**

```bash
git status
```

If clean: nothing to do. If there are uncommitted changes, review and commit them.

---

## Self-Review

**Spec coverage:**
- ✅ Website translation: content.ts scroll listener added (Task 5)
- ✅ Translation window: SCROLL_SYNC handler updated to anchor-based (Task 4)
- ✅ PDF viewer: ratio sync replaced with anchor-based (Task 6)
- ✅ messages.ts SCROLL_SYNC type updated (Task 2)
- ✅ rAF throttling: both content.ts and pdf-viewer.ts use `rafPending` flag
- ✅ `behavior: 'smooth'` removed (per spec — causes jitter at 60fps)
- ✅ Edge case: `blocks.get(anchorId)` returns undefined → early return (Task 4, Step 1)
- ✅ Edge case: PDF `transEl` null check (Task 6, Step 1)
- ✅ Feature branch: Task 1

**Placeholder scan:** None found.

**Type consistency:** `anchorId: string`, `anchorPx: number` used consistently across messages.ts, content.ts, translation.ts, and all test files.
