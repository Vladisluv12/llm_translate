import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAIClient } from '../src/background/openai-client'

const mockConfig = {
  apiUrl: 'http://localhost:11434/v1/chat/completions',
  apiKey: '',
  model: 'llama3.1',
  temperature: 0.1,
  requestTimeout: 30,
}

describe('OpenAIClient', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('sends correct request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Перевод текста' } }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = new OpenAIClient(mockConfig)
    await client.complete('system msg', 'user msg')

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    const body = JSON.parse(opts.body as string)
    expect(body.model).toBe('llama3.1')
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[1].role).toBe('user')
    expect(body.temperature).toBe(0.1)
  })

  it('returns response text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Привет мир' } }],
      }),
    }))

    const client = new OpenAIClient(mockConfig)
    const result = await client.complete('sys', 'user')
    expect(result).toBe('Привет мир')
  })

  it('throws with status on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    }))

    const client = new OpenAIClient(mockConfig)
    await expect(client.complete('sys', 'user')).rejects.toMatchObject({ status: 429 })
  })

  it('throws on timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 200))
    ))

    const client = new OpenAIClient({ ...mockConfig, requestTimeout: 0.05 })
    await expect(client.complete('sys', 'user')).rejects.toThrow(/timeout/i)
  })
})
