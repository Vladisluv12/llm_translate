# Translation Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache translated pages in `browser.storage.local` so re-visiting a translated page or PDF replays instantly without calling the API, with per-page and clear-all buttons in the UI.

**Architecture:** New `src/shared/translation-cache.ts` module owns all storage operations. `worker.ts` checks cache before translating (hit → instant replay, miss → translate + accumulate + save). `pdf-viewer.ts` checks cache per page before translating. Popup and settings import the module directly to clear cache.

**Tech Stack:** TypeScript, Firefox WebExtension MV3, `browser.storage.local`, Vitest (unit), Playwright (UX)

---

## File Map

| File | Change |
|------|--------|
| `src/shared/translation-cache.ts` | **New** — normalizeUrl, get/set/clear functions |
| `src/background/worker.ts` | Check cache pre-translation; accumulate + save post-translation |
| `src/pdf/pdf-viewer.ts` | Check/save per-page in IntersectionObserver callback |
| `src/popup/popup.html` | Add "Clear page cache" button |
| `src/popup/popup.ts` | Wire up clear button |
| `src/settings/settings.html` | Add Cache section with clear-all button |
| `src/settings/settings.ts` | Wire up clear-all button |
| `tests/ux/browser-mock.ts` | Add `remove` + `get(null)` support |
| `tests/translation-cache.test.ts` | **New** — Vitest unit tests |
| `tests/ux/popup.spec.ts` | Add clear-cache button test |
| `tests/ux/settings.spec.ts` | Add clear-all-cache button test |

---

### Task 1: Create feature branch

**Files:** (git only)

- [ ] **Step 1: Create and switch to feature branch**

```bash
git checkout -b feature/translation-cache
```

Expected: `Switched to a new branch 'feature/translation-cache'`

---

### Task 2: Update browser mock — add `remove` and `get(null)`

**Files:**
- Modify: `tests/ux/browser-mock.ts`

The clear-cache feature needs `browser.storage.local.remove` (currently absent from the mock) and `get(null)` (returns entire store, used by `clearAllCache`).

- [ ] **Step 1: Add `remove` method and fix `get(null)` in `browser-mock.ts`**

Find the `storage.local` object inside `BROWSER_MOCK_SCRIPT`. It currently ends with:
```js
        set(obj) { Object.assign(this._store, obj); return Promise.resolve(); },
      }
```

Replace the `get` function and add `remove` so the whole `local` block reads:
```js
      local: {
        _store: {
          config: {
            apiUrl: 'http://localhost:11434/v1/chat/completions',
            model: 'llama3.1', temperature: 0.1, requestTimeout: 120,
            maxRPS: 5, maxTextLengthPerRequest: 1800, maxParagraphsPerRequest: 10,
            systemPrompt: 'You are a translator.',
            multiplePrompt: 'Translate {{from}} to {{to}}:\\n{{json}}',
            singlePrompt: 'Translate {{from}} to {{to}}:\\n{{text}}',
            aiContextAware: false, sourceLang: 'auto', apiKey: '',
          }
        },
        get(key) {
          if (key === null) return Promise.resolve({ ...this._store });
          const result = {};
          const keys = typeof key === 'string' ? [key] : (Array.isArray(key) ? key : Object.keys(key));
          keys.forEach(k => { if (this._store[k] !== undefined) result[k] = this._store[k]; });
          return Promise.resolve(result);
        },
        set(obj) { Object.assign(this._store, obj); return Promise.resolve(); },
        remove(keys) {
          const arr = typeof keys === 'string' ? [keys] : keys;
          arr.forEach(k => delete this._store[k]);
          return Promise.resolve();
        },
      }
```

- [ ] **Step 2: Commit**

```bash
git add tests/ux/browser-mock.ts
git commit -m "test: add storage.local.remove and get(null) to browser mock"
```

---

### Task 3: `translation-cache.ts` — TDD

**Files:**
- Create: `tests/translation-cache.test.ts`
- Create: `src/shared/translation-cache.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/translation-cache.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  normalizeUrl,
  getPageCache,
  setPageCache,
  getPdfPageCache,
  setPdfPageCache,
  clearPageCache,
  clearAllCache,
} from '../src/shared/translation-cache'
import type { PageCacheEntry } from '../src/shared/translation-cache'

const store: Record<string, unknown> = {}

vi.stubGlobal('browser', {
  storage: {
    local: {
      get: vi.fn(async (key: string | string[] | null) => {
        if (key === null) return { ...store }
        const keys = Array.isArray(key) ? key : [key]
        return Object.fromEntries(keys.filter(k => k in store).map(k => [k, store[k]]))
      }),
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(store, items) }),
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys]
        arr.forEach(k => delete store[k])
      }),
    },
  },
})

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k])
  vi.clearAllMocks()
})

describe('normalizeUrl', () => {
  it('strips fragment', () => {
    expect(normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page')
  })
  it('keeps query params', () => {
    expect(normalizeUrl('https://example.com/page?q=1')).toBe('https://example.com/page?q=1')
  })
  it('strips trailing slash from root origin', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com')
  })
  it('keeps path trailing slash if path is not root', () => {
    expect(normalizeUrl('https://example.com/blog/')).toBe('https://example.com/blog/')
  })
})

describe('getPageCache / setPageCache', () => {
  it('returns null on miss', async () => {
    expect(await getPageCache('https://example.com')).toBeNull()
  })
  it('returns stored entry on hit', async () => {
    const entry: PageCacheEntry = {
      cachedAt: 1000,
      blocks: [{ id: 'zt-0', originalText: 'Hello', translatedText: 'Привет' }],
    }
    await setPageCache('https://example.com', entry)
    expect(await getPageCache('https://example.com')).toEqual(entry)
  })
  it('normalizes URL before lookup — fragment stripped', async () => {
    const entry: PageCacheEntry = { cachedAt: 1000, blocks: [] }
    await setPageCache('https://example.com/page#section', entry)
    expect(await getPageCache('https://example.com/page')).toEqual(entry)
  })
})

describe('getPdfPageCache / setPdfPageCache', () => {
  it('returns null on miss', async () => {
    expect(await getPdfPageCache('https://example.com/doc.pdf', 1)).toBeNull()
  })
  it('stores and retrieves page text', async () => {
    await setPdfPageCache('https://example.com/doc.pdf', 3, 'Страница три')
    expect(await getPdfPageCache('https://example.com/doc.pdf', 3)).toBe('Страница три')
  })
  it('merges multiple pages under one storage key', async () => {
    await setPdfPageCache('https://example.com/doc.pdf', 1, 'One')
    await setPdfPageCache('https://example.com/doc.pdf', 2, 'Two')
    expect(await getPdfPageCache('https://example.com/doc.pdf', 1)).toBe('One')
    expect(await getPdfPageCache('https://example.com/doc.pdf', 2)).toBe('Two')
  })
  it('returns null for untranslated page when others exist', async () => {
    await setPdfPageCache('https://example.com/doc.pdf', 1, 'One')
    expect(await getPdfPageCache('https://example.com/doc.pdf', 5)).toBeNull()
  })
})

describe('clearPageCache', () => {
  it('removes page entry for the URL', async () => {
    await setPageCache('https://example.com/a', { cachedAt: 0, blocks: [] })
    await clearPageCache('https://example.com/a')
    expect(await getPageCache('https://example.com/a')).toBeNull()
  })
  it('removes pdf entry for the URL', async () => {
    await setPdfPageCache('https://example.com/doc.pdf', 1, 'text')
    await clearPageCache('https://example.com/doc.pdf')
    expect(await getPdfPageCache('https://example.com/doc.pdf', 1)).toBeNull()
  })
  it('does not throw when no entry exists (idempotent)', async () => {
    await expect(clearPageCache('https://example.com/missing')).resolves.toBeUndefined()
  })
})

describe('clearAllCache', () => {
  it('removes all zt-cache: keys', async () => {
    await setPageCache('https://a.com', { cachedAt: 0, blocks: [] })
    await setPageCache('https://b.com', { cachedAt: 0, blocks: [] })
    await clearAllCache()
    expect(await getPageCache('https://a.com')).toBeNull()
    expect(await getPageCache('https://b.com')).toBeNull()
  })
  it('leaves non-cache keys untouched', async () => {
    store['config'] = { model: 'llama3.1' }
    await setPageCache('https://a.com', { cachedAt: 0, blocks: [] })
    await clearAllCache()
    expect(store['config']).toEqual({ model: 'llama3.1' })
  })
  it('does not throw when cache is empty', async () => {
    await expect(clearAllCache()).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npx vitest run tests/translation-cache.test.ts
```

Expected: `Cannot find module '../src/shared/translation-cache'`

- [ ] **Step 3: Implement `src/shared/translation-cache.ts`**

Create `src/shared/translation-cache.ts`:

```ts
export interface PageCacheEntry {
  cachedAt: number
  blocks: Array<{ id: string; originalText: string; translatedText: string }>
}

export interface PdfCacheEntry {
  cachedAt: number
  pages: Record<string, string>
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    const s = u.toString()
    // Strip trailing slash only when the path is exactly "/"
    return s.endsWith('/') && u.pathname === '/' ? s.slice(0, -1) : s
  } catch {
    return url
  }
}

function pageKey(url: string): string {
  return `zt-cache:page:${normalizeUrl(url)}`
}

function pdfKey(url: string): string {
  return `zt-cache:pdf:${normalizeUrl(url)}`
}

export async function getPageCache(url: string): Promise<PageCacheEntry | null> {
  const key = pageKey(url)
  const result = await browser.storage.local.get(key)
  return (result[key] as PageCacheEntry) ?? null
}

export async function setPageCache(url: string, entry: PageCacheEntry): Promise<void> {
  await browser.storage.local.set({ [pageKey(url)]: entry })
}

export async function getPdfPageCache(url: string, pageNum: number): Promise<string | null> {
  const key = pdfKey(url)
  const result = await browser.storage.local.get(key)
  const entry = result[key] as PdfCacheEntry | undefined
  return entry?.pages[String(pageNum)] ?? null
}

export async function setPdfPageCache(url: string, pageNum: number, text: string): Promise<void> {
  const key = pdfKey(url)
  const result = await browser.storage.local.get(key)
  const entry: PdfCacheEntry = (result[key] as PdfCacheEntry) ?? { cachedAt: Date.now(), pages: {} }
  entry.pages[String(pageNum)] = text
  await browser.storage.local.set({ [key]: entry })
}

export async function clearPageCache(url: string): Promise<void> {
  await browser.storage.local.remove([pageKey(url), pdfKey(url)])
}

export async function clearAllCache(): Promise<void> {
  const all = await browser.storage.local.get(null)
  const keys = Object.keys(all).filter(k => k.startsWith('zt-cache:'))
  if (keys.length > 0) await browser.storage.local.remove(keys)
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npx vitest run tests/translation-cache.test.ts
```

Expected: all 16 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/shared/translation-cache.ts tests/translation-cache.test.ts
git commit -m "feat: translation-cache module with unit tests"
```

---

### Task 4: Integrate cache into `worker.ts`

**Files:**
- Modify: `src/background/worker.ts:50-171`

The function signature uses `_sourceUrl` (unused). We'll rename it to `sourceUrl` and use it for caching.

- [ ] **Step 1: Add import at the top of `worker.ts`**

Find the existing imports at the top of `src/background/worker.ts`. Add:
```ts
import { getPageCache, setPageCache } from '../shared/translation-cache'
```

- [ ] **Step 2: Rename parameter and add cache hit path**

Find the function signature:
```ts
async function startTranslation(tabId: number, _sourceUrl: string): Promise<void> {
```

Change to:
```ts
async function startTranslation(tabId: number, sourceUrl: string): Promise<void> {
```

Then find (just after `active.set(tabId, state)`):
```ts
  try {
    // Extract text blocks from the page
    let typedBlocks: Array<{ id: string; text: string }>
```

Insert the cache check block **before** that `try`:
```ts
  // Cache hit: replay instantly without calling API
  const cachedPage = await getPageCache(sourceUrl)
  if (cachedPage) {
    for (const block of cachedPage.blocks) {
      await sendToTranslationWindow(translationWindowId, {
        type: 'TRANSLATION_BLOCK',
        block: { id: block.id, originalText: block.originalText, translatedText: block.translatedText },
      })
    }
    await sendToTranslationWindow(translationWindowId, { type: 'TRANSLATION_DONE' })
    return
  }

  try {
    // Extract text blocks from the page
    let typedBlocks: Array<{ id: string; text: string }>
```

- [ ] **Step 3: Add cache accumulator after `typedBlocks` extraction**

Find the line after the try/catch that extracts blocks:
```ts
    const allText = typedBlocks.map(b => b.text).join(' ')
```

Insert **before** that line:
```ts
    const cacheAccumulator: Array<{ id: string; originalText: string; translatedText: string }> = []

    const allText = typedBlocks.map(b => b.text).join(' ')
```

- [ ] **Step 4: Push to accumulator in the batch loop**

In the batch loop, find the block that sends each translated item:
```ts
          const blockMsg: Message = {
            type: 'TRANSLATION_BLOCK',
            block: { id: item.id, originalText: item.text, translatedText },
          }
          await sendToTranslationWindow(translationWindowId, blockMsg)
```

Insert **after** `await sendToTranslationWindow(translationWindowId, blockMsg)`:
```ts
          cacheAccumulator.push({ id: item.id, originalText: item.text, translatedText })
```

Also find the single-paragraph fallback inside the `catch (err)` block:
```ts
            const blockMsg: Message = {
              type: 'TRANSLATION_BLOCK',
              block: { id: item.id, originalText: item.text, translatedText: raw.trim() },
            }
            await sendToTranslationWindow(translationWindowId, blockMsg)
```

Insert **after** that `await sendToTranslationWindow`:
```ts
            cacheAccumulator.push({ id: item.id, originalText: item.text, translatedText: raw.trim() })
```

- [ ] **Step 5: Save cache on completion**

Find:
```ts
    if (!state.aborted) {
      await sendToTranslationWindow(translationWindowId, { type: 'TRANSLATION_DONE' })
    }
```

Replace with:
```ts
    if (!state.aborted) {
      await sendToTranslationWindow(translationWindowId, { type: 'TRANSLATION_DONE' })
      if (cacheAccumulator.length === typedBlocks.length) {
        try {
          await setPageCache(sourceUrl, { cachedAt: Date.now(), blocks: cacheAccumulator })
        } catch { /* storage quota exceeded — translation succeeded, cache skipped */ }
      }
    }
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npm run lint
```

Expected: no errors in `worker.ts` or `translation-cache.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/background/worker.ts src/shared/translation-cache.ts
git commit -m "feat: cache website translations in worker — hit replays instantly"
```

---

### Task 5: Integrate cache into `pdf-viewer.ts`

**Files:**
- Modify: `src/pdf/pdf-viewer.ts` — IntersectionObserver callback (~lines 110-145)

- [ ] **Step 1: Add import**

Add to the imports at the top of `src/pdf/pdf-viewer.ts`:
```ts
import { getPdfPageCache, setPdfPageCache } from '../shared/translation-cache'
```

- [ ] **Step 2: Add cache check inside the observer callback**

Inside the `IntersectionObserver` callback, find the guard line:
```ts
      if (!pageNum || pageCache.get(pageNum)?.text || pagesInProgress.has(pageNum)) continue
```

Insert **immediately after** that line:
```ts
      // Check translation cache before calling API
      const cachedTranslation = await getPdfPageCache(pdfUrl, pageNum)
      if (cachedTranslation) {
        const transEl = document.getElementById(`trans-${pageNum}`)!
        transEl.textContent = cachedTranslation
        transEl.classList.remove('loading')
        const cachedPage = pageCache.get(pageNum)
        if (cachedPage) cachedPage.text = cachedTranslation  // prevents re-translation check
        continue
      }
```

- [ ] **Step 3: Save to cache after successful translation**

Find inside the observer callback:
```ts
        try {
          const translated = await queue.enqueue(() => client.complete(config.systemPrompt, prompt))
          transEl.textContent = translated.trim()
          transEl.classList.remove('loading')
        } catch (err) {
```

Replace the `try` block content with:
```ts
        try {
          const translated = await queue.enqueue(() => client.complete(config.systemPrompt, prompt))
          transEl.textContent = translated.trim()
          transEl.classList.remove('loading')
          try {
            await setPdfPageCache(pdfUrl, pageNum, translated.trim())
          } catch { /* storage quota exceeded — display succeeded, cache skipped */ }
        } catch (err) {
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run lint
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/pdf/pdf-viewer.ts
git commit -m "feat: cache PDF page translations — hit renders instantly"
```

---

### Task 6: Popup — "Clear page cache" button

**Files:**
- Modify: `src/popup/popup.html`
- Modify: `src/popup/popup.ts`
- Modify: `tests/ux/popup.spec.ts`

- [ ] **Step 1: Write the failing Playwright test first**

In `tests/ux/popup.spec.ts`, add at the end of the file:

```ts
test('clear page cache button shows Cleared confirmation then reverts', async ({ page }) => {
  await openPopup(page)
  const btn = page.locator('#btn-clear-cache')
  await expect(btn).toBeVisible()
  await btn.click()
  await expect(btn).toHaveText('Cleared ✓')
  await page.waitForTimeout(1600)
  await expect(btn).toHaveText('Clear page cache')
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npx playwright test tests/ux/popup.spec.ts --grep "clear page cache" --reporter=line
```

Expected: FAIL — `#btn-clear-cache` not found.

- [ ] **Step 3: Add button to `popup.html`**

Find in `src/popup/popup.html`:
```html
  <button id="btn-translate">Translate Page</button>
  <button id="btn-pdf" style="display:none">Translate PDF</button>
```

Replace with:
```html
  <button id="btn-translate">Translate Page</button>
  <button id="btn-pdf" style="display:none">Translate PDF</button>
  <button id="btn-clear-cache" style="background:#666">Clear page cache</button>
```

- [ ] **Step 4: Wire up the button in `popup.ts`**

Add the import at the top of `src/popup/popup.ts`:
```ts
import { clearPageCache } from '../shared/translation-cache'
```

Add the button constant alongside the other constants at the top of the file:
```ts
const btnClearCache = document.getElementById('btn-clear-cache') as HTMLButtonElement
```

Add the click handler (outside `init`, at module level, after the other event handlers):
```ts
btnClearCache.addEventListener('click', async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  await clearPageCache(tab.url ?? '')
  btnClearCache.textContent = 'Cleared ✓'
  setTimeout(() => { btnClearCache.textContent = 'Clear page cache' }, 1500)
})
```

- [ ] **Step 5: Run test — expect pass**

```bash
npx playwright test tests/ux/popup.spec.ts --reporter=line
```

Expected: all popup tests pass including the new one.

- [ ] **Step 6: Commit**

```bash
git add src/popup/popup.html src/popup/popup.ts tests/ux/popup.spec.ts
git commit -m "feat: clear page cache button in popup"
```

---

### Task 7: Settings — "Clear all cached translations" section

**Files:**
- Modify: `src/settings/settings.html`
- Modify: `src/settings/settings.ts`
- Modify: `tests/ux/settings.spec.ts`

- [ ] **Step 1: Write the failing Playwright test first**

In `tests/ux/settings.spec.ts`, add at the end:

```ts
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
```

- [ ] **Step 2: Run test — expect failure**

```bash
npx playwright test tests/ux/settings.spec.ts --grep "clear all cache" --reporter=line
```

Expected: FAIL — `#btn-clear-all-cache` not found.

- [ ] **Step 3: Add Cache section to `settings.html`**

Find in `src/settings/settings.html`:
```html
  <button id="save">Save Settings</button>
```

Insert **before** that line:
```html
  <h2>Cache</h2>
  <p class="hint">Translations are stored locally. Cached pages load instantly on revisit.</p>
  <button id="btn-clear-all-cache" style="background:#666">Clear all cached translations</button>
  <span id="clear-all-status" class="hint"></span>

```

- [ ] **Step 4: Wire up in `settings.ts`**

Add the import at the top of `src/settings/settings.ts`:
```ts
import { clearAllCache } from '../shared/translation-cache'
```

Add at the bottom of `src/settings/settings.ts` (after the existing `addEventListener` calls):
```ts
const btnClearAllCache = document.getElementById('btn-clear-all-cache') as HTMLButtonElement
const clearAllStatus = document.getElementById('clear-all-status') as HTMLSpanElement

btnClearAllCache.addEventListener('click', async () => {
  await clearAllCache()
  clearAllStatus.textContent = 'All translations cleared ✓'
  setTimeout(() => { clearAllStatus.textContent = '' }, 2000)
})
```

- [ ] **Step 5: Run test — expect pass**

```bash
npx playwright test tests/ux/settings.spec.ts --reporter=line
```

Expected: all settings tests pass including the new one.

- [ ] **Step 6: Commit**

```bash
git add src/settings/settings.html src/settings/settings.ts tests/ux/settings.spec.ts
git commit -m "feat: clear all cached translations button in settings"
```

---

### Task 8: Final verification

**Files:** (none — verification only)

- [ ] **Step 1: Run all unit tests**

```bash
npx vitest run
```

Expected: all pass (includes the new `translation-cache.test.ts`).

- [ ] **Step 2: Run all non-integration UX tests**

```bash
npx playwright test tests/ux/translation-window.spec.ts tests/ux/popup.spec.ts tests/ux/settings.spec.ts --reporter=line
```

Expected: all pass.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: `✓ built in ~200ms`, no errors.

- [ ] **Step 4: Lint check**

```bash
npm run lint
```

Expected: no errors in `src/` files (pre-existing test file errors are acceptable).

---

## Self-Review

**Spec coverage:**
- ✅ `translation-cache.ts` module: Task 3
- ✅ Website cache check + replay: Task 4
- ✅ Website cache save on completion: Task 4
- ✅ PDF cache check per page: Task 5
- ✅ PDF cache save per page: Task 5
- ✅ Popup clear button: Task 6
- ✅ Settings clear-all button: Task 7
- ✅ Storage quota error handling (try/catch around `set`): Tasks 4, 5
- ✅ `clearPageCache` removes both page and PDF keys: `translation-cache.ts` — `clearPageCache` calls `remove([pageKey, pdfKey])`
- ✅ `normalizeUrl` strips fragment, keeps query: Task 3 tests + implementation

**Type consistency:** `PageCacheEntry`, `PdfCacheEntry` defined in `translation-cache.ts` and imported wherever needed. `cacheAccumulator` type matches `PageCacheEntry['blocks']`.

**YAGNI check:** No cache size display, no TTL, no statistics — all excluded per spec.
