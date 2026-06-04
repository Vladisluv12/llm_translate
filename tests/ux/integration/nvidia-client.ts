import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  const envPath = path.resolve(__dirname, '../../../.env.test')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
  }
}
loadEnv()

export const NVIDIA_CONFIG = {
  apiUrl: process.env.NVIDIA_API_URL ?? 'https://integrate.api.nvidia.com/v1/chat/completions',
  apiKey: process.env.NVIDIA_API_KEY ?? '',
  model: process.env.NVIDIA_MODEL ?? 'meta/llama-3.1-8b-instruct',
  temperature: 0.2,
  top_p: 0.7,
  max_tokens: 1024,
}

export async function translateText(text: string, from = 'English', to = 'Russian'): Promise<string> {
  const res = await fetch(NVIDIA_CONFIG.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${NVIDIA_CONFIG.apiKey}`,
    },
    body: JSON.stringify({
      model: NVIDIA_CONFIG.model,
      temperature: NVIDIA_CONFIG.temperature,
      top_p: NVIDIA_CONFIG.top_p,
      max_tokens: NVIDIA_CONFIG.max_tokens,
      stream: false,
      messages: [
        {
          role: 'system',
          content: 'You are a professional translator. Translate accurately, preserving tone. Output only the translation.',
        },
        {
          role: 'user',
          content: `Translate the following text from ${from} to ${to}:\n\n${text}`,
        },
      ],
    }),
  })

  if (!res.ok) throw new Error(`NVIDIA API ${res.status}: ${await res.text()}`)
  const data = await res.json() as { choices: Array<{ message: { content: string } }> }
  if (!data.choices?.length) throw new Error('Empty response from NVIDIA API')
  return data.choices[0].message.content.trim()
}

export async function translateBatch(
  items: Array<{ id: string; text: string }>,
  from = 'English',
  to = 'Russian'
): Promise<Map<string, string>> {
  const json = JSON.stringify(items.map(b => ({ id: b.id, text: b.text })), null, 2)
  const res = await fetch(NVIDIA_CONFIG.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${NVIDIA_CONFIG.apiKey}`,
    },
    body: JSON.stringify({
      model: NVIDIA_CONFIG.model,
      temperature: NVIDIA_CONFIG.temperature,
      top_p: NVIDIA_CONFIG.top_p,
      max_tokens: NVIDIA_CONFIG.max_tokens,
      stream: false,
      messages: [
        {
          role: 'system',
          content: 'You are a professional translator. Output only valid JSON, no extra text.',
        },
        {
          role: 'user',
          content: `Translate the following paragraphs from ${from} to ${to}. Return ONLY a JSON array with the same structure, replacing each "text" value with its ${to} translation.\n\n${json}`,
        },
      ],
    }),
  })

  if (!res.ok) throw new Error(`NVIDIA API ${res.status}: ${await res.text()}`)
  const data = await res.json() as { choices: Array<{ message: { content: string } }> }
  const raw = data.choices[0].message.content
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) throw new Error(`Could not parse JSON from response: ${raw.slice(0, 200)}`)

  const parsed = JSON.parse(match[0]) as Array<{ id: string; text: string }>
  const result = new Map<string, string>()
  for (const item of parsed) result.set(item.id, item.text)
  return result
}
