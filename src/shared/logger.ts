
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  ts: number
  level: LogLevel
  module: string
  msg: string
  data?: unknown
}

const MAX_ENTRIES = 500
const STORAGE_KEY = 'zt_logs'
const FLUSH_INTERVAL_MS = 2000

const pending: LogEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function scheduleFlush(): void {
  if (flushTimer !== null) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushToStorage()
  }, FLUSH_INTERVAL_MS)
}

async function flushToStorage(): Promise<void> {
  if (pending.length === 0) return
  const toWrite = pending.splice(0, pending.length)
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY)
    const existing: LogEntry[] = (stored[STORAGE_KEY] as LogEntry[]) ?? []
    const combined = [...existing, ...toWrite]
    if (combined.length > MAX_ENTRIES) combined.splice(0, combined.length - MAX_ENTRIES)
    await browser.storage.local.set({ [STORAGE_KEY]: combined })
  } catch { /* storage unavailable */ }
}

function push(entry: LogEntry): void {
  pending.push(entry)
  scheduleFlush()

  const prefix = `[zt:${entry.module}]`
  if (entry.level === 'error') {
    console.error(prefix, entry.msg, ...(entry.data !== undefined ? [entry.data] : []))
  } else if (entry.level === 'warn') {
    console.warn(prefix, entry.msg, ...(entry.data !== undefined ? [entry.data] : []))
  } else {
    console.log(prefix, entry.msg, ...(entry.data !== undefined ? [entry.data] : []))
  }
}

export function createLogger(module: string) {
  return {
    debug: (msg: string, data?: unknown) => push({ ts: Date.now(), level: 'debug', module, msg, ...(data !== undefined ? { data } : {}) }),
    info:  (msg: string, data?: unknown) => push({ ts: Date.now(), level: 'info',  module, msg, ...(data !== undefined ? { data } : {}) }),
    warn:  (msg: string, data?: unknown) => push({ ts: Date.now(), level: 'warn',  module, msg, ...(data !== undefined ? { data } : {}) }),
    error: (msg: string, data?: unknown) => push({ ts: Date.now(), level: 'error', module, msg, ...(data !== undefined ? { data } : {}) }),
  }
}

export async function getLogs(): Promise<LogEntry[]> {
  await flushToStorage()
  const stored = await browser.storage.local.get(STORAGE_KEY)
  return (stored[STORAGE_KEY] as LogEntry[]) ?? []
}

export async function clearLogs(): Promise<void> {
  pending.length = 0
  await browser.storage.local.remove(STORAGE_KEY)
}

export function formatLogs(entries: LogEntry[]): string {
  return entries.map(e => {
    const time = new Date(e.ts).toISOString()
    const data = e.data !== undefined ? ' ' + JSON.stringify(e.data) : ''
    return `${time} [${e.level.toUpperCase().padEnd(5)}] [${e.module}] ${e.msg}${data}`
  }).join('\n')
}
