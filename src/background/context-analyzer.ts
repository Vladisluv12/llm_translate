import { OpenAIClient } from './openai-client'

export interface PageContext {
  theme: string
  terms: Record<string, string>
}

const CONTEXT_SYSTEM_PROMPT =
  'You are a document analyzer. Respond only with valid JSON, no extra text.'

const CONTEXT_USER_PROMPT = `Analyze this document and return JSON with this exact structure:
{"theme": "one sentence describing the topic", "terms": {"english_term": "russian_translation", ...}}

Include up to 10 key domain-specific terms that should be translated consistently.

Title: {{title}}

Content (first 500 words):
{{content}}`

export async function analyzePageContext(
  client: OpenAIClient,
  title: string,
  content: string
): Promise<PageContext> {
  const userMsg = CONTEXT_USER_PROMPT
    .replace('{{title}}', title)
    .replace('{{content}}', content.split(/\s+/).slice(0, 500).join(' '))

  try {
    const raw = await client.complete(CONTEXT_SYSTEM_PROMPT, userMsg)
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return { theme: '', terms: {} }
    const parsed = JSON.parse(match[0]) as PageContext
    return {
      theme: parsed.theme ?? '',
      terms: parsed.terms ?? {},
    }
  } catch {
    return { theme: '', terms: {} }
  }
}
