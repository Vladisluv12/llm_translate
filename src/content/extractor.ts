export const TRANSLATABLE_SELECTORS =
  'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, figcaption'

const SKIP_PARENTS = new Set(['code', 'pre', 'script', 'style', 'noscript'])

export interface TextBlock {
  id: string
  text: string
  element: Element
}

let idCounter = 0

function hasSkippedParent(el: Element): boolean {
  let node: Element | null = el
  while (node) {
    if (SKIP_PARENTS.has(node.tagName.toLowerCase())) return true
    node = node.parentElement
  }
  return false
}

export function extractTextBlocks(root: Element = document.body): TextBlock[] {
  const elements = Array.from(root.querySelectorAll(TRANSLATABLE_SELECTORS))
  const blocks: TextBlock[] = []

  for (const el of elements) {
    const text = el.textContent?.trim() ?? ''
    if (text.split(/\s+/).filter(w => w.length > 0).length < 3) continue
    if (hasSkippedParent(el)) continue

    const id = `zt-${++idCounter}`
    el.setAttribute('data-zt-id', id)
    blocks.push({ id, text, element: el })
  }

  return blocks
}
