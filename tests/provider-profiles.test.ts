import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadConfig, saveConfig, applyProfile, DEFAULT_CONFIG } from '../src/shared/config'
import type { ProviderConfig } from '../src/shared/config'

const store: Record<string, unknown> = {}

vi.stubGlobal('browser', {
  storage: {
    local: {
      get: vi.fn(async (key: string | string[] | null) => {
        if (key === null) return { ...store }
        const keys = Array.isArray(key) ? key : [key]
        return Object.fromEntries(keys.filter(k => k in store).map(k => [k, store[k]]))
      }),
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(store, items) }),
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys]
        arr.forEach(k => delete store[k])
      }),
    },
  },
})

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k])
  vi.clearAllMocks()
})

describe('loadConfig migration', () => {
  it('migrates legacy flat config to profile-based', async () => {
    store.config = {
      apiUrl: 'https://old.api.com',
      apiKey: 'old-key',
      model: 'old-model',
      temperature: 0.5,
    }
    const config = await loadConfig()
    expect(config.profiles).toHaveLength(1)
    expect(config.profiles[0].id).toBe('default')
    expect(config.profiles[0].apiUrl).toBe('https://old.api.com')
    expect(config.profiles[0].apiKey).toBe('old-key')
    expect(config.profiles[0].model).toBe('old-model')
    expect(config.activeProfileId).toBe('default')
    expect(config.temperature).toBe(0.5)
  })

  it('preserves existing profile-based config', async () => {
    const existing: ProviderConfig = {
      ...DEFAULT_CONFIG,
      profiles: [
        { id: 'custom', name: 'Custom', apiUrl: 'http://custom', apiKey: '', model: 'custom-model' },
      ],
      activeProfileId: 'custom',
    }
    store.config = existing
    const config = await loadConfig()
    expect(config.activeProfileId).toBe('custom')
    expect(config.profiles[0].model).toBe('custom-model')
  })
})

describe('applyProfile', () => {
  it('merges active profile fields into config', () => {
    const config: ProviderConfig = {
      ...DEFAULT_CONFIG,
      activeProfileId: 'mistral-local',
    }
    const merged = applyProfile(config)
    expect(merged.apiUrl).toBe('http://localhost:11434/v1/chat/completions')
    expect(merged.model).toBe('mistral:7b')
    expect(merged.apiKey).toBe('')
    expect(merged.temperature).toBe(DEFAULT_CONFIG.temperature)
  })

  it('falls back to first profile when active not found', () => {
    const config: ProviderConfig = {
      ...DEFAULT_CONFIG,
      activeProfileId: 'nonexistent',
    }
    const merged = applyProfile(config)
    expect(merged.apiUrl).toBe(DEFAULT_CONFIG.profiles[0].apiUrl)
  })
})

describe('saveConfig + loadConfig roundtrip', () => {
  it('persists and retrieves profiles', async () => {
    const config: ProviderConfig = {
      ...DEFAULT_CONFIG,
      profiles: [
        { id: 'test', name: 'Test', apiUrl: 'http://test', apiKey: 'key', model: 'test-model' },
      ],
      activeProfileId: 'test',
      scrollSyncEnabled: false,
    }
    await saveConfig(config)
    const loaded = await loadConfig()
    expect(loaded.activeProfileId).toBe('test')
    expect(loaded.scrollSyncEnabled).toBe(false)
    expect(loaded.profiles[0].name).toBe('Test')
  })
})
