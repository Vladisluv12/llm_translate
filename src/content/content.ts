import { extractTextBlocks } from './extractor'

// Expose extraction function to background worker via scripting.executeScript
;(window as unknown as Record<string, unknown>).__ztExtract = () =>
  extractTextBlocks(document.body).map(b => ({ id: b.id, text: b.text }))

// Listen for scroll sync from translation window
browser.runtime.onMessage.addListener((msg: { type: string; ratio?: number }) => {
  if (msg.type === 'SCROLL_SYNC' && msg.ratio !== undefined) {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: msg.ratio * maxScroll, behavior: 'smooth' })
  }
})
