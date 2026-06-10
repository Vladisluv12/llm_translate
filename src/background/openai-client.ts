import { createLogger } from '../shared/logger'

const log = createLogger('openai')

interface ClientConfig {
  apiUrl: string
  apiKey: string
  model: string
  temperature: number
  requestTimeout: number  // seconds
}

export class OpenAIClient {
  constructor(private readonly config: ClientConfig) {}

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    log.debug('API request', { model: this.config.model, apiUrl: this.config.apiUrl, systemLen: systemPrompt.length, userLen: userPrompt.length })

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Request timeout after ${this.config.requestTimeout}s`)),
        this.config.requestTimeout * 1000
      )
    })

    const fetchPromise = fetch(this.config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey
          ? { Authorization: `Bearer ${this.config.apiKey}` }
          : {}),
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: this.config.temperature,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
      }),
    })

    const response = await Promise.race([fetchPromise, timeoutPromise])

    if (!response.ok) {
      const body = await response.text()
      const retryAfterSec = response.headers.get('Retry-After')
      const retryAfterMs = retryAfterSec ? parseInt(retryAfterSec, 10) * 1000 : undefined
      log.error('API error response', { status: response.status, body, retryAfterMs })
      const error = Object.assign(new Error(`API error ${response.status}: ${body}`), {
        status: response.status,
        retryAfterMs,
      })
      throw error
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> }
    if (!data.choices?.length) {
      log.error('empty choices in API response', { data })
      throw new Error('Empty choices in API response')
    }
    const content = data.choices[0].message.content
    log.debug('API response ok', { contentLen: content.length })
    return content
  }
}
