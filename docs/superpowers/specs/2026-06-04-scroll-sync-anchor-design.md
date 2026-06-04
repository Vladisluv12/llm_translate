# Scroll Sync — Anchor-Based Design

**Date:** 2026-06-04  
**Status:** Approved  
**Branch:** feature/scroll-sync-anchor

---

## Problem

Scroll synchronisation between the source page and the translation window is currently broken for website translation — `content.ts` has no scroll event listener, so nothing drives the sync. The PDF viewer has a working but inaccurate ratio-based sync that drifts as translated text grows longer than the source (Russian is ~20–25% longer than English).

---

## Goal

When the user scrolls the source page (or the left PDF panel), the translation window (or right PDF panel) scrolls so that the translation of the topmost visible paragraph is at the top of the translation viewport — exact paragraph-level alignment, no drift.

---

## Algorithm: Virtual Anchor Scroll Sync

This is the standard approach used by Immersive Translate, CodeMirror merge view, and VS Code's diff editor.

1. On every scroll event (throttled via `requestAnimationFrame`):
   - Walk through source-side anchor elements in DOM order.
   - Find the first one whose `rect.bottom > 0` — the topmost element that is at least partially visible.
   - Record `anchorId` (the element's `data-zt-id` or page number) and `anchorPx` (how many pixels of the element have already scrolled above the viewport top: `max(0, -rect.top)`).
2. On the translation side:
   - Find the matching element by `anchorId`.
   - Set `scrollTop = el.offsetTop - anchorPx`.

This gives exact alignment regardless of height differences between source and translated content.

---

## Data Flow

### Website translation

```
content.ts  (source page tab)
  window scroll → rAF throttle
  → find first [data-zt-id] with rect.bottom > 0
  → browser.runtime.sendMessage({ type:'SCROLL_SYNC', anchorId, anchorPx })
        ↓  Firefox runtime broadcast (all extension pages receive)
translation.ts  (right window)
  → blocks.get(anchorId) → el
  → window.scrollTo({ top: el.offsetTop - anchorPx })
```

### PDF viewer

Both panels live in the same `pdf-viewer.html` page — no message passing needed.

```
pdf-viewer.ts
  #pdf-panel scroll → rAF throttle
  → find first [data-page=N] with rect.bottom > pdfPanel top
  → anchorPx = max(0, pdfPanelTop - rect.top)
  → translationPanel.scrollTop = #trans-N.offsetTop - anchorPx
```

---

## File Changes

| File | Change |
|------|--------|
| `src/shared/messages.ts` | `SCROLL_SYNC` payload: replace `ratio: number` with `anchorId: string; anchorPx: number` |
| `src/content/content.ts` | Add `scroll` event listener with rAF throttle; find topmost visible `[data-zt-id]`; send `SCROLL_SYNC` |
| `src/translation/translation.ts` | Update `SCROLL_SYNC` handler: remove ratio math, use `blocks.get(anchorId)` + `offsetTop - anchorPx` |
| `src/pdf/pdf-viewer.ts` | Replace ratio-based scroll sync block with anchor-based; find topmost `[data-page]` canvas; scroll `#trans-N` |

No new files. No new dependencies.

---

## Edge Cases

**Block not yet translated (still shows `...`):** The `[data-zt-id]` element exists in the translation DOM from the moment `getOrCreateBlock` is called, so `blocks.get(anchorId)` succeeds and the window scrolls to the correct position — the text just happens to say `...` until translation arrives.

**anchorId not found in translation window:** `blocks.get(anchorId)` returns `undefined` → handler returns early → no scroll. This can happen at the very start before any blocks are created. Harmless: the next scroll event will try again.

**PDF: translation element not yet rendered:** `document.getElementById('trans-N')` returns `null` → skip. The observer-driven translation hasn't started for that page yet; the user hasn't scrolled there.

**Highlight behaviour (translation.ts):** The existing closest-block highlight logic runs after the scroll, so it correctly highlights the anchor element. No changes needed.

---

## Throttling

Both scroll listeners use the same pattern:

```ts
let rafPending = false
element.addEventListener('scroll', () => {
  if (rafPending) return
  rafPending = true
  requestAnimationFrame(() => {
    rafPending = false
    // ... find anchor, send/apply sync
  })
}, { passive: true })
```

This caps message rate at the display refresh rate (≤60 fps) with zero timer overhead.

---

## Not In Scope

- Reverse sync (translation → source): intentionally removed in the previous commit. Not re-added.
- Smooth `behavior: 'smooth'` on the translation side: removed in this design. Smooth scrolling on a receiver that gets 60 fps updates causes lag and visual jitter — each smooth animation is interrupted by the next message before it finishes.
- Interpolation between anchors (Approach C): deferred to a future iteration.
