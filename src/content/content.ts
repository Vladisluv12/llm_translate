import { extractTextBlocks } from './extractor'
import { loadConfig } from '../shared/config'
import type { Message } from '../shared/messages'
import { showInlinePanel } from './inline-panel'
import { createLogger } from '../shared/logger'

const log = createLogger('content')

log.info('content script loaded', { url: location.href, readyState: document.readyState })

;(window as unknown as Record<string, unknown>).__ztExtract =
  () => {
    log.debug('__ztExtract called', { readyState: document.readyState })
    const blocks = extractTextBlocks(document.body).map(b => ({ id: b.id, text: b.text }))
    log.debug('__ztExtract returning', { count: blocks.length })
    return blocks
  }

log.info('__ztExtract defined on window')

let scrollSyncEnabled = true
loadConfig().then(c => { scrollSyncEnabled = c.scrollSyncEnabled })

browser.storage.onChanged.addListener((changes) => {
  if (changes.config?.newValue?.scrollSyncEnabled !== undefined) {
    scrollSyncEnabled = changes.config.newValue.scrollSyncEnabled
  }
})

let rafPending = false
window.addEventListener('scroll', () => {
  if (rafPending || !scrollSyncEnabled) return
  rafPending = true
  requestAnimationFrame(() => {
    rafPending = false
    const elements = document.querySelectorAll<HTMLElement>('[data-zt-id]')
    if (elements.length === 0) { return }
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

// Click sync: click on source block → send CLICK_SYNC to translation window
document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-zt-id]')
  if (!el) return
  browser.runtime.sendMessage({
    type: 'CLICK_SYNC',
    anchorId: el.dataset.ztId!,
  }).catch(() => {})
})

// Message listener: inline panel + reverse click sync
browser.runtime.onMessage.addListener((msg: Message) => {
  if (msg.type === 'SELECTION_TRANSLATED') {
    log.debug('SELECTION_TRANSLATED received', { originalLen: msg.originalText.length, translatedLen: msg.translatedText.length })
    showInlinePanel(msg.originalText, msg.translatedText)
    return false
  }

  if (msg.type === 'CLICK_SYNC_BACK') {
    const el = document.querySelector<HTMLElement>(`[data-zt-id="${msg.anchorId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.style.transition = 'background 0.4s'
      el.style.background = 'rgba(58, 123, 213, 0.12)'
      setTimeout(() => { el.style.background = '' }, 1200)
    }
    return false
  }
  return false
})
