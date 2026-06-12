export const TRANSLATABLE_SELECTORS =
  'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, figcaption'

const SKIP_PARENTS = new Set(['code', 'pre', 'script', 'style', 'noscript'])

export interface TextBlock {
  id: string
  text: string
  element: Element
}

let idCounter = 0
export const MIN_WORD_COUNT = 2  // Reduced from 3 to include headings with 2 words

import { createLogger } from '../shared/logger'
const log = createLogger('extractor')

export function resetIdCounter(): void {
  idCounter = 0
}

function hasSkippedParent(el: Element): boolean {
  let node: Element | null = el
  while (node) {
    if (SKIP_PARENTS.has(node.tagName.toLowerCase())) return true
    node = node.parentElement
  }
  return false
}

export function extractTextBlocks(root: Element = document.body): TextBlock[] {
  log.debug('extractTextBlocks start', { selector: TRANSLATABLE_SELECTORS })
  const elements = Array.from(root.querySelectorAll(TRANSLATABLE_SELECTORS))
  log.debug('matched elements', { count: elements.length })
  const blocks: TextBlock[] = []

  for (const el of elements) {
    const text = el.textContent?.trim() ?? ''
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length
    if (wordCount < MIN_WORD_COUNT) {
      log.debug('skipped: word count', { text: text.slice(0, 50), count: wordCount })
      continue
    }
    if (hasSkippedParent(el)) {
      log.debug('skipped: parent', { tagName: el.tagName, parent: el.parentElement?.tagName })
      continue
    }

    const id = `zt-${++idCounter}`
    el.setAttribute('data-zt-id', id)
    blocks.push({ id, text, element: el })
  }

  log.info('extractTextBlocks done', { blocks: blocks.length })
  return blocks
}
