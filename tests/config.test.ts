import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG } from '../src/shared/config'

describe('DEFAULT_CONFIG', () => {
  it('has correct Ollama endpoint', () => {
    expect(DEFAULT_CONFIG.apiUrl).toBe('http://localhost:11434/v1/chat/completions')
  })

  it('has llama3.1 as default model', () => {
    expect(DEFAULT_CONFIG.model).toBe('llama3.1')
  })

  it('has 120s timeout', () => {
    expect(DEFAULT_CONFIG.requestTimeout).toBe(120)
  })

  it('has maxRPS of 5', () => {
    expect(DEFAULT_CONFIG.maxRPS).toBe(5)
  })
})
