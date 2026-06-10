import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createLogger, getLogs, clearLogs, formatLogs } from '../src/shared/logger'

const store: Record<string, unknown> = {}

vi.stubGlobal('browser', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => {
        return key in store ? { [key]: store[key] } : {}
      }),
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(store, items) }),
      remove: vi.fn(async (key: string) => { delete store[key] }),
    },
  },
})

beforeEach(async () => {
  Object.keys(store).forEach(k => delete store[k])
  vi.clearAllMocks()
  vi.useFakeTimers()
  await clearLogs()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createLogger', () => {
  it('exposes debug/info/warn/error methods', () => {
    const log = createLogger('test')
    expect(typeof log.debug).toBe('function')
    expect(typeof log.info).toBe('function')
    expect(typeof log.warn).toBe('function')
    expect(typeof log.error).toBe('function')
  })

  it('getLogs flushes pending entries and returns them', async () => {
    const log = createLogger('worker')
    log.info('translation started', { tabId: 1 })
    log.warn('something fishy')

    const entries = await getLogs()
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ level: 'info', module: 'worker', msg: 'translation started', data: { tabId: 1 } })
    expect(entries[1]).toMatchObject({ level: 'warn', module: 'worker', msg: 'something fishy' })
    expect(typeof entries[0].ts).toBe('number')
  })

  it('accumulates entries from multiple loggers', async () => {
    const logA = createLogger('worker')
    const logB = createLogger('popup')
    logA.info('worker event')
    logB.error('popup error', { code: 500 })

    const entries = await getLogs()
    expect(entries).toHaveLength(2)
    expect(entries[0].module).toBe('worker')
    expect(entries[1].module).toBe('popup')
    expect(entries[1].data).toEqual({ code: 500 })
  })

  it('does not include data key when data is undefined', async () => {
    const log = createLogger('test')
    log.info('no data')

    const entries = await getLogs()
    expect('data' in entries[0]).toBe(false)
  })

  it('second getLogs call returns same entries (buffer not doubled)', async () => {
    const log = createLogger('test')
    log.info('once')

    const first = await getLogs()
    expect(first).toHaveLength(1)

    const second = await getLogs()
    expect(second).toHaveLength(1)
    expect(second[0].msg).toBe('once')
  })

  it('caps ring buffer at 500 entries', async () => {
    const log = createLogger('test')
    for (let i = 0; i < 520; i++) log.info(`msg ${i}`)

    const entries = await getLogs()
    expect(entries.length).toBe(500)
    expect(entries[499].msg).toBe('msg 519')
  })
})

describe('clearLogs', () => {
  it('empties stored entries', async () => {
    const log = createLogger('test')
    log.info('a')
    log.info('b')
    await getLogs() // flush

    await clearLogs()
    expect(await getLogs()).toHaveLength(0)
  })

  it('discards pending buffer before flush', async () => {
    const log = createLogger('test')
    log.info('before clear')
    await clearLogs() // clears pending without flushing first

    expect(await getLogs()).toHaveLength(0)
  })
})

describe('formatLogs', () => {
  it('produces ISO timestamp + level + module + message lines', () => {
    const entries = [
      { ts: new Date('2025-01-01T12:00:00.000Z').getTime(), level: 'info' as const, module: 'worker', msg: 'hello' },
      { ts: new Date('2025-01-01T12:00:01.000Z').getTime(), level: 'error' as const, module: 'openai', msg: 'fail', data: { status: 503 } },
    ]
    const out = formatLogs(entries)
    const lines = out.split('\n')
    expect(lines[0]).toMatch(/2025-01-01T12:00:00\.000Z \[INFO \] \[worker\] hello/)
    expect(lines[1]).toMatch(/2025-01-01T12:00:01\.000Z \[ERROR\] \[openai\] fail/)
    expect(lines[1]).toContain('"status":503')
  })

  it('returns empty string for empty array', () => {
    expect(formatLogs([])).toBe('')
  })
})
