import { extractTextBlocks } from './extractor'

;(window as unknown as Record<string, unknown>).__ztExtract =
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
