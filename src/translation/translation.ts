import type { Message, TranslationBlock } from '../shared/messages'

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

  if (msg.type === 'SCROLL_SYNC') {
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
})

setStatus('Waiting for translation...')
