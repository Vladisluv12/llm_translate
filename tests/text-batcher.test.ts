import { describe, it, expect } from 'vitest'
import { batchBlocks, renderMultiplePrompt, parseMultipleResponse } from '../src/background/text-batcher'

const blocks = Array.from({ length: 12 }, (_, i) => ({
  id: `zt-${i}`,
  text: `Paragraph number ${i} with some content here`,
}))

describe('batchBlocks', () => {
  it('splits into batches respecting maxParagraphs', () => {
    const batches = batchBlocks(blocks, { maxParagraphs: 5, maxLength: 10000 })
    expect(batches).toHaveLength(3)
    expect(batches[0]).toHaveLength(5)
    expect(batches[2]).toHaveLength(2)
  })

  it('splits into batches respecting maxLength', () => {
    const batches = batchBlocks(blocks, { maxParagraphs: 100, maxLength: 100 })
    // each block ~40 chars, so max 2 per batch
    for (const batch of batches) {
      const totalLen = batch.reduce((acc, b) => acc + b.text.length, 0)
      expect(totalLen).toBeLessThanOrEqual(100)
    }
  })
})

describe('renderMultiplePrompt', () => {
  it('renders JSON into prompt template', () => {
    const batch = [{ id: 'zt-0', text: 'Hello world test' }]
    const result = renderMultiplePrompt(
      'Translate {{from}} to {{to}}:\n\n{{json}}',
      batch,
      'English',
      'Russian'
    )
    expect(result).toContain('"id": "zt-0"')
    expect(result).toContain('English')
    expect(result).toContain('Russian')
  })
})

describe('parseMultipleResponse', () => {
  it('parses valid JSON array response', () => {
    const raw = '[{"id":"zt-0","text":"Привет мир"},{"id":"zt-1","text":"Второй абзац"}]'
    const result = parseMultipleResponse(raw)
    expect(result.get('zt-0')).toBe('Привет мир')
    expect(result.get('zt-1')).toBe('Второй абзац')
  })

  it('extracts JSON from response with extra text', () => {
    const raw = 'Here is the translation:\n[{"id":"zt-0","text":"Привет"}]\nDone.'
    const result = parseMultipleResponse(raw)
    expect(result.get('zt-0')).toBe('Привет')
  })

  it('returns empty map for unparseable response', () => {
    const result = parseMultipleResponse('not json at all')
    expect(result.size).toBe(0)
  })
})
