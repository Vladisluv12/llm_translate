import { describe, it, expect, beforeEach } from 'vitest'
import { showInlinePanel } from '../src/content/inline-panel'

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('showInlinePanel', () => {
  it('creates panel with original and translated text', () => {
    showInlinePanel('Hello world', 'Привет мир')
    const panel = document.getElementById('zt-inline-panel')
    expect(panel).not.toBeNull()
    expect(panel!.textContent).toContain('Hello world')
    expect(panel!.textContent).toContain('Привет мир')
  })

  it('replaces existing panel on second call', () => {
    showInlinePanel('First', 'Первый')
    showInlinePanel('Second', 'Второй')
    const panels = document.querySelectorAll('#zt-inline-panel')
    expect(panels).toHaveLength(1)
    expect(panels[0].textContent).toContain('Second')
  })

  it('close button removes panel', () => {
    showInlinePanel('Test', 'Тест')
    const closeBtn = document.getElementById('zt-inline-close')
    expect(closeBtn).not.toBeNull()
    closeBtn!.click()
    expect(document.getElementById('zt-inline-panel')).toBeNull()
  })
})
