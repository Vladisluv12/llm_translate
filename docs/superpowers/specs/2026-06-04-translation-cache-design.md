# Translation Cache — Design Spec

**Date:** 2026-06-04  
**Status:** Approved  
**Branch:** feature/translation-cache

---

## Overview

Cache translated pages in `browser.storage.local` so re-visiting a translated page replays instantly without calling the API. Both website and PDF translation are cached. Invalidation is manual only — via a per-page button in the popup and a clear-all button in settings.

---

## Data Structures

```ts
// src/shared/translation-cache.ts

interface PageCacheEntry {
  cachedAt: number  // Unix timestamp ms
  blocks: Array<{ id: string; originalText: string; translatedText: string }>
}

interface PdfCacheEntry {
  cachedAt: number
  pages: Record<string, string>  // pageNum (string) → translatedText
}
```

Storage key format:
- Website page: `zt-cache:page:${normalizeUrl(url)}`
- PDF document: `zt-cache:pdf:${normalizeUrl(url)}`

**URL normalization:** strip `#fragment`, preserve `?query` (query params affect page content). Strip trailing slash.

**Storage backend:** `browser.storage.local`. Default Firefox quota ~10 MB. At ~30 KB per cached page, supports 300+ pages before hitting limits.

---

## New Module: `src/shared/translation-cache.ts`

Single file owning all cache operations. Imported by `worker.ts`, `pdf-viewer.ts`, `popup.ts`, and `settings.ts`.

```ts
export function normalizeUrl(url: string): string
// Strips #fragment, trims trailing slash, keeps ?query

export async function getPageCache(url: string): Promise<PageCacheEntry | null>
export async function setPageCache(url: string, entry: PageCacheEntry): Promise<void>

export async function getPdfPageCache(url: string, pageNum: number): Promise<string | null>
export async function setPdfPageCache(url: string, pageNum: number, text: string): Promise<void>

export async function clearPageCache(url: string): Promise<void>
// Deletes the single storage key for this URL. Idempotent — no error if key missing.

export async function clearAllCache(): Promise<void>
// Fetches all storage keys, deletes those prefixed with "zt-cache:".
```

---

## Cache Flow

### Website translation (`src/background/worker.ts` — `startTranslation`)

```
startTranslation(tabId, sourceUrl)
  │
  ├─ getPageCache(sourceUrl)
  │    ├─ CACHE HIT:
  │    │    for each block in entry.blocks:
  │    │      sendToTranslationWindow(TRANSLATION_BLOCK)
  │    │    sendToTranslationWindow(TRANSLATION_DONE)
  │    │    return  ← no API calls
  │    │
  │    └─ CACHE MISS:
  │         extract blocks → translate in batches
  │         accumulate completed blocks in cacheAccumulator[]
  │         on TRANSLATION_DONE (if !state.aborted):
  │           setPageCache(sourceUrl, { cachedAt: Date.now(), blocks: cacheAccumulator })
  └─ done
```

Cache is written only on successful, non-aborted completion. Partial translations are never cached.

### PDF translation (`src/pdf/pdf-viewer.ts` — IntersectionObserver)

```
Page N enters viewport
  │
  ├─ getPdfPageCache(pdfUrl, pageNum)
  │    ├─ HIT: transEl.textContent = cachedText  ← instant, no API
  │    └─ MISS: extractPageText → translate → display
  │             setPdfPageCache(pdfUrl, pageNum, translatedText)
  └─ done
```

Each PDF page is cached independently as it is translated. On revisit, already-cached pages render instantly; uncached pages translate on demand as normal.

---

## UI Changes

### Popup (`src/popup/popup.html` + `popup.ts`)

Add a **"Clear page cache"** button below the translate button:

```html
<button id="btn-clear-cache">Clear page cache</button>
```

Behaviour:
- Visible whenever the popup opens (any tab)
- On click: `clearPageCache(tab.url!)`
- Button text changes to **"Cleared ✓"** for 1.5 s, then reverts
- Idempotent — no error if no cache exists for the URL

### Settings (`src/settings/settings.html` + `settings.ts`)

Add a **Cache** section at the bottom of the settings page:

```html
<section id="section-cache">
  <h2>Cache</h2>
  <p>Translations are stored locally. Cached pages load instantly on revisit.</p>
  <button id="btn-clear-all-cache">Clear all cached translations</button>
  <span id="clear-all-status"></span>
</section>
```

Behaviour:
- On click: `clearAllCache()`
- Status span shows **"All translations cleared ✓"** for 2 s, then hides

---

## File Changes

| File | Change |
|------|--------|
| `src/shared/translation-cache.ts` | **New file** — all cache read/write/clear operations |
| `src/background/worker.ts` | Check cache before translating; save cache on completion |
| `src/pdf/pdf-viewer.ts` | Check cache per page before translating; save per page on completion |
| `src/popup/popup.html` | Add "Clear page cache" button |
| `src/popup/popup.ts` | Wire up clear-cache button |
| `src/settings/settings.html` | Add Cache section |
| `src/settings/settings.ts` | Wire up clear-all-cache button |

---

## Edge Cases

**Aborted translation:** `state.aborted = true` → `setPageCache` is never called. Partial results are not persisted.

**PDF partial cache:** Only successfully translated pages are stored. If the user closes the viewer mid-way, already-cached pages remain cached; uncached pages will translate on next visit.

**`clearPageCache` with no existing entry:** `browser.storage.local.remove` on a missing key is a no-op — no error thrown.

**`clearAllCache` with empty storage:** Safe — filters keys array before calling `remove`.

**Storage quota exceeded:** `setPageCache` / `setPdfPageCache` may throw a `QuotaExceededError`. Both callers (`worker.ts`, `pdf-viewer.ts`) wrap the call in try/catch and log a warning; translation still completes successfully, just not persisted.

---

## Not In Scope

- Cache size display or management UI
- Automatic TTL-based expiry
- Cache warm-up / pre-fetch
- Per-model or per-language-pair cache namespacing
