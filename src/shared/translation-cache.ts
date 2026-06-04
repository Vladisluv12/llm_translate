export interface PageCacheEntry {
  cachedAt: number
  blocks: Array<{ id: string; originalText: string; translatedText: string }>
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    const s = u.toString()
    // Strip trailing slash only when the path is exactly "/"
    return s.endsWith('/') && u.pathname === '/' ? s.slice(0, -1) : s
  } catch {
    return url
  }
}

function pageKey(url: string): string {
  return `zt-cache:page:${normalizeUrl(url)}`
}

function pdfKey(url: string, pageNum: number): string {
  return `zt-cache:pdf:${normalizeUrl(url)}:${pageNum}`
}

export async function getPageCache(url: string): Promise<PageCacheEntry | null> {
  const key = pageKey(url)
  const result = await browser.storage.local.get(key)
  return (result[key] as PageCacheEntry) ?? null
}

export async function setPageCache(url: string, entry: PageCacheEntry): Promise<void> {
  await browser.storage.local.set({ [pageKey(url)]: entry })
}

export async function getPdfPageCache(url: string, pageNum: number): Promise<string | null> {
  const key = pdfKey(url, pageNum)
  const result = await browser.storage.local.get(key)
  return (result[key] as string) ?? null
}

export async function setPdfPageCache(url: string, pageNum: number, text: string): Promise<void> {
  await browser.storage.local.set({ [pdfKey(url, pageNum)]: text })
}

export async function clearPageCache(url: string): Promise<void> {
  const pageK = pageKey(url)
  const pdfPrefix = `zt-cache:pdf:${normalizeUrl(url)}:`
  const all = await browser.storage.local.get(null)
  const pdfKeys = Object.keys(all).filter(k => k.startsWith(pdfPrefix))
  await browser.storage.local.remove([pageK, ...pdfKeys])
}

export async function clearAllCache(): Promise<void> {
  const all = await browser.storage.local.get(null)
  const keys = Object.keys(all).filter(k => k.startsWith('zt-cache:'))
  if (keys.length > 0) await browser.storage.local.remove(keys)
}
