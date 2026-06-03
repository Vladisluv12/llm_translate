import { describe, it, expect, beforeEach } from 'vitest'
import { extractTextBlocks, resetIdCounter } from '../src/content/extractor'

describe('extractTextBlocks', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    resetIdCounter()
  })

  it('extracts paragraphs with unique ids', () => {
    document.body.innerHTML = `
      <p>Hello world today</p>
      <p>Second paragraph here</p>
    `
    const blocks = extractTextBlocks(document.body)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].text).toBe('Hello world today')
    expect(blocks[0].id).toBeTruthy()
    expect(blocks[1].id).not.toBe(blocks[0].id)
  })

  it('skips code blocks', () => {
    document.body.innerHTML = `
      <p>Normal text here</p>
      <pre><code>const x = 1</code></pre>
    `
    const blocks = extractTextBlocks(document.body)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('Normal text here')
  })

  it('skips elements with less than 3 words', () => {
    document.body.innerHTML = '<p>Hi</p><p>This is real content here</p>'
    const blocks = extractTextBlocks(document.body)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('This is real content here')
  })

  it('assigns data-zt-id to each element', () => {
    document.body.innerHTML = '<p>Some text here for testing</p>'
    const blocks = extractTextBlocks(document.body)
    const el = document.querySelector('[data-zt-id]')
    expect(el).not.toBeNull()
    expect(el!.getAttribute('data-zt-id')).toBe(blocks[0].id)
  })
})
