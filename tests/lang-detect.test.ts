import { describe, it, expect } from 'vitest'
import { detectLang } from '../src/shared/lang-detect'

describe('detectLang', () => {
  it('detects English', () => {
    expect(detectLang('The quick brown fox jumps over the lazy dog. This is a longer text to help detection.')).toBe('en')
  })

  it('detects Chinese', () => {
    expect(detectLang('这是一段中文文字，用于测试语言检测功能是否正常工作。')).toBe('zh')
  })

  it('falls back to en for unknown short text', () => {
    expect(detectLang('xyz')).toBe('en')
  })
})
