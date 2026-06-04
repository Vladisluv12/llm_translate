import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  normalizeUrl,
  getPageCache,
  setPageCache,
  getPdfPageCache,
  setPdfPageCache,
  clearPageCache,
  clearAllCache,
} from '../src/shared/translation-cache'
import type { PageCacheEntry } from '../src/shared/translation-cache'

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

describe('normalizeUrl', () => {
  it('strips fragment', () => {
    expect(normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page')
  })
  it('keeps query params', () => {
    expect(normalizeUrl('https://example.com/page?q=1')).toBe('https://example.com/page?q=1')
  })
  it('strips trailing slash from root origin', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com')
  })
  it('keeps path trailing slash if path is not root', () => {
    expect(normalizeUrl('https://example.com/blog/')).toBe('https://example.com/blog/')
  })
})

describe('getPageCache / setPageCache', () => {
  it('returns null on miss', async () => {
    expect(await getPageCache('https://example.com')).toBeNull()
  })
  it('returns stored entry on hit', async () => {
    const entry: PageCacheEntry = {
      cachedAt: 1000,
      blocks: [{ id: 'zt-0', originalText: 'Hello', translatedText: 'Привет' }],
    }
    await setPageCache('https://example.com', entry)
    expect(await getPageCache('https://example.com')).toEqual(entry)
  })
  it('normalizes URL before lookup — fragment stripped', async () => {
    const entry: PageCacheEntry = { cachedAt: 1000, blocks: [] }
    await setPageCache('https://example.com/page#section', entry)
    expect(await getPageCache('https://example.com/page')).toEqual(entry)
  })
})

describe('getPdfPageCache / setPdfPageCache', () => {
  it('returns null on miss', async () => {
    expect(await getPdfPageCache('https://example.com/doc.pdf', 1)).toBeNull()
  })
  it('stores and retrieves page text', async () => {
    await setPdfPageCache('https://example.com/doc.pdf', 3, 'Страница три')
    expect(await getPdfPageCache('https://example.com/doc.pdf', 3)).toBe('Страница три')
  })
  it('merges multiple pages under one storage key', async () => {
    await setPdfPageCache('https://example.com/doc.pdf', 1, 'One')
    await setPdfPageCache('https://example.com/doc.pdf', 2, 'Two')
    expect(await getPdfPageCache('https://example.com/doc.pdf', 1)).toBe('One')
    expect(await getPdfPageCache('https://example.com/doc.pdf', 2)).toBe('Two')
  })
  it('returns null for untranslated page when others exist', async () => {
    await setPdfPageCache('https://example.com/doc.pdf', 1, 'One')
    expect(await getPdfPageCache('https://example.com/doc.pdf', 5)).toBeNull()
  })
})

describe('clearPageCache', () => {
  it('removes page entry for the URL', async () => {
    await setPageCache('https://example.com/a', { cachedAt: 0, blocks: [] })
    await clearPageCache('https://example.com/a')
    expect(await getPageCache('https://example.com/a')).toBeNull()
  })
  it('removes pdf entry for the URL', async () => {
    await setPdfPageCache('https://example.com/doc.pdf', 1, 'text')
    await clearPageCache('https://example.com/doc.pdf')
    expect(await getPdfPageCache('https://example.com/doc.pdf', 1)).toBeNull()
  })
  it('does not throw when no entry exists (idempotent)', async () => {
    await expect(clearPageCache('https://example.com/missing')).resolves.toBeUndefined()
  })
})

describe('clearAllCache', () => {
  it('removes all zt-cache: keys', async () => {
    await setPageCache('https://a.com', { cachedAt: 0, blocks: [] })
    await setPageCache('https://b.com', { cachedAt: 0, blocks: [] })
    await clearAllCache()
    expect(await getPageCache('https://a.com')).toBeNull()
    expect(await getPageCache('https://b.com')).toBeNull()
  })
  it('leaves non-cache keys untouched', async () => {
    store['config'] = { model: 'llama3.1' }
    await setPageCache('https://a.com', { cachedAt: 0, blocks: [] })
    await clearAllCache()
    expect(store['config']).toEqual({ model: 'llama3.1' })
  })
  it('does not throw when cache is empty', async () => {
    await expect(clearAllCache()).resolves.toBeUndefined()
  })
})
