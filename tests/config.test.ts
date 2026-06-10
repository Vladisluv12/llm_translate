
import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG, applyProfile } from '../src/shared/config'

describe('DEFAULT_CONFIG', () => {
  it('has 120s timeout', () => {
    expect(DEFAULT_CONFIG.requestTimeout).toBe(120)
  })

  it('has maxRPS of 5', () => {
    expect(DEFAULT_CONFIG.maxRPS).toBe(5)
  })

  it('has 3 default profiles', () => {
    expect(DEFAULT_CONFIG.profiles).toHaveLength(3)
    expect(DEFAULT_CONFIG.profiles.map(p => p.id)).toContain('nvidia')
    expect(DEFAULT_CONFIG.profiles.map(p => p.id)).toContain('llama-local')
    expect(DEFAULT_CONFIG.profiles.map(p => p.id)).toContain('mistral-local')
  })

  it('has activeProfileId set to nvidia', () => {
    expect(DEFAULT_CONFIG.activeProfileId).toBe('nvidia')
  })

  it('has scrollSyncEnabled true by default', () => {
    expect(DEFAULT_CONFIG.scrollSyncEnabled).toBe(true)
  })
})

describe('applyProfile', () => {
  it('merges active profile into config', () => {
    const config = { ...DEFAULT_CONFIG, activeProfileId: 'llama-local' }
    const merged = applyProfile(config)
    expect(merged.apiUrl).toBe('http://localhost:11434/v1/chat/completions')
    expect(merged.model).toBe('llama3.1')
    expect(merged.apiKey).toBe('')
  })

  it('falls back to first profile when activeProfileId not found', () => {
    const config = { ...DEFAULT_CONFIG, activeProfileId: 'nonexistent' }
    const merged = applyProfile(config)
    expect(merged.apiUrl).toBe(DEFAULT_CONFIG.profiles[0].apiUrl)
  })
})
