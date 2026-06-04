import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RateLimitedQueue } from '../src/background/queue'

describe('RateLimitedQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('executes task immediately when under rate limit', async () => {
    const q = new RateLimitedQueue({ maxRPS: 10 })
    const fn = vi.fn().mockResolvedValue('result')
    const result = await q.enqueue(fn)
    expect(fn).toHaveBeenCalledOnce()
    expect(result).toBe('result')
  })

  it('retries on 429 with backoff', async () => {
    const q = new RateLimitedQueue({ maxRPS: 10 })
    let calls = 0
    const fn = vi.fn().mockImplementation(async () => {
      calls++
      if (calls < 3) throw Object.assign(new Error('rate limit'), { status: 429 })
      return 'ok'
    })

    const promise = q.enqueue(fn)
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws after max retries exceeded', async () => {
    const q = new RateLimitedQueue({ maxRPS: 10, maxRetries: 2 })
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('fail'), { status: 429 }))

    const promise = q.enqueue(fn)
    await vi.runAllTimersAsync()
    await expect(promise).rejects.toThrow('fail')
    expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
  })
})

  it('uses retryAfterMs from error instead of exponential backoff', async () => {
    const q = new RateLimitedQueue({ maxRPS: 10 })
    let calls = 0
    let actualDelay = 0
    const origSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: TimerHandler, delay?: number) => {
      if (calls === 1) actualDelay = delay ?? 0
      fn instanceof Function && fn()
      return 0 as unknown as ReturnType<typeof setTimeout>
    })

    const fn = vi.fn().mockImplementation(async () => {
      calls++
      if (calls < 2) throw Object.assign(new Error('rate limit'), { status: 429, retryAfterMs: 45000 })
      return 'ok'
    })

    const promise = q.enqueue(fn)
    await vi.runAllTimersAsync()
    await promise
    expect(actualDelay).toBe(45000)
    vi.restoreAllMocks()
  })
