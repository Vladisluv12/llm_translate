import type { Message, TranslationBlock } from '../shared/messages'

const params = new URLSearchParams(location.search)
const sourceTabId = parseInt(params.get('sourceTabId') ?? '0', 10)

const statusEl = document.getElementById('status')!
const contentEl = document.getElementById('content')!

const blocks = new Map<string, HTMLElement>()

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
    setStatus(`Translation complete`)
  }

  if (msg.type === 'TRANSLATION_ERROR') {
    setStatus(`Error: ${msg.message}`)
  }

  if (msg.type === 'SCROLL_SYNC' && msg.ratio !== undefined) {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: msg.ratio * maxScroll, behavior: 'smooth' })

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
})

// Send scroll position back to source tab
window.addEventListener('scroll', () => {
  if (!sourceTabId) return
  const ratio = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight || 1)
  browser.tabs.sendMessage(sourceTabId, { type: 'SCROLL_SYNC', ratio }).catch(() => {})
})

setStatus('Waiting for translation...')
