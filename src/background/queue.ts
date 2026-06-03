interface QueueOptions {
  maxRPS: number
  maxRetries?: number
}

export class RateLimitedQueue {
  private tokens: number
  private lastRefill: number
  private readonly maxRPS: number
  private readonly maxRetries: number

  constructor(opts: QueueOptions) {
    this.maxRPS = opts.maxRPS
    this.maxRetries = opts.maxRetries ?? 4
    this.tokens = opts.maxRPS
    this.lastRefill = Date.now()
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    this.tokens = Math.min(this.maxRPS, this.tokens + elapsed * this.maxRPS)
    this.lastRefill = now
  }

  private async waitForToken(): Promise<void> {
    this.refill()
    if (this.tokens >= 1) {
      this.tokens -= 1
      return
    }
    const waitMs = ((1 - this.tokens) / this.maxRPS) * 1000
    await new Promise(resolve => setTimeout(resolve, waitMs))
    this.tokens = 0
  }

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitForToken()

    let attempt = 0
    while (true) {
      try {
        return await fn()
      } catch (err: unknown) {
        const status = (err as { status?: number }).status
        if (status === 429 && attempt < this.maxRetries) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 30000)
          await new Promise(resolve => setTimeout(resolve, backoff))
          attempt++
        } else {
          throw err
        }
      }
    }
  }
}
