import type { Message, TranslationBlock } from '../shared/messages'
import { loadConfig } from '../shared/config'

const statusEl = document.getElementById('status')!
const contentEl = document.getElementById('content')!

import { createLogger } from '../shared/logger'

const log = createLogger('translation')

const blocks = new Map<string, HTMLElement>()

let scrollSyncEnabled = true
loadConfig().then(c => { scrollSyncEnabled = c.scrollSyncEnabled })

browser.storage.onChanged.addListener((changes) => {
  if (changes.config?.newValue?.scrollSyncEnabled !== undefined) {
    scrollSyncEnabled = changes.config.newValue.scrollSyncEnabled
  }
})

function setStatus(text: string): void {
  statusEl.textContent = text
}

function getOrCreateBlock(id: string): HTMLElement {
  if (blocks.has(id)) return blocks.get(id)!
  const div = document.createElement('div')
  div.className = 'block loading'
  div.dataset.ztId = id
  div.textContent = '...'
  contentEl.appendChild(div)
  blocks.set(id, div)
  return div
}

browser.runtime.onMessage.addListener((msg: Message) => {
  log.debug('message received', { type: msg.type })

  if (msg.type === 'TRANSLATION_BLOCK') {
    const block = msg.block as TranslationBlock
    const el = getOrCreateBlock(block.id)
    el.textContent = block.translatedText ?? block.originalText
    el.classList.remove('loading')
  }

  if (msg.type === 'TRANSLATION_PROGRESS') {
    setStatus(`Translating... ${msg.done} / ${msg.total}`)
  }

  if (msg.type === 'TRANSLATION_DONE') {
    log.info('translation done')
    setStatus(`Translation complete`)
  }

  if (msg.type === 'TRANSLATION_ERROR') {
    log.error('translation error received', { message: msg.message })
    setStatus(`Error: ${msg.message}`)
  }

  if (msg.type === 'SCROLL_SYNC' && scrollSyncEnabled) {
    const { anchorId, anchorPx } = msg as Extract<Message, { type: 'SCROLL_SYNC' }>
    const el = blocks.get(anchorId)
    if (!el) return

    window.scrollTo({ top: el.offsetTop - anchorPx })

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

  if (msg.type === 'CLICK_SYNC') {
    const el = blocks.get(msg.anchorId)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    for (const b of blocks.values()) b.classList.remove('highlight')
    el.classList.add('highlight')
  }
})

// Click sync back: click on translation block → scroll source tab
document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-zt-id]')
  if (!el) return
  const params = new URLSearchParams(location.search)
  const sourceTabId = parseInt(params.get('sourceTabId') ?? '0', 10)
  if (!sourceTabId) return
  browser.tabs.sendMessage(sourceTabId, {
    type: 'CLICK_SYNC_BACK',
    anchorId: el.dataset.ztId!,
  }).catch(() => {})
})

setStatus('Waiting for translation...')
