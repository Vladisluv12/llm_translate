export interface ProviderConfig {
  apiUrl: string
  apiKey: string
  model: string
  temperature: number
  requestTimeout: number       // seconds
  maxRPS: number
  maxTextLengthPerRequest: number
  maxParagraphsPerRequest: number
  systemPrompt: string
  multiplePrompt: string
  singlePrompt: string
  aiContextAware: boolean
  sourceLang: 'auto' | 'en' | 'zh'
}

export const DEFAULT_CONFIG: ProviderConfig = {
  apiUrl: 'http://localhost:11434/v1/chat/completions',
  apiKey: '',
  model: 'llama3.1',
  temperature: 0.1,
  requestTimeout: 120,
  maxRPS: 5,
  maxTextLengthPerRequest: 1800,
  maxParagraphsPerRequest: 10,
  systemPrompt:
    'You are a professional translator. Translate accurately, preserving tone and formatting. Output only the translation, no explanations.',
  multiplePrompt:
    'Translate the paragraphs from {{from}} to {{to}}. Return ONLY a valid JSON array with the same structure, replacing each "text" value with its {{to}} translation. No extra text.\n\n{{json}}',
  singlePrompt: 'Translate the following text from {{from}} to {{to}}. Output only the translation:\n\n{{text}}',
  aiContextAware: false,
  sourceLang: 'auto',
}

export async function loadConfig(): Promise<ProviderConfig> {
  const stored = await browser.storage.local.get('config')
  return { ...DEFAULT_CONFIG, ...(stored.config as Partial<ProviderConfig> ?? {}) }
}

export async function saveConfig(config: ProviderConfig): Promise<void> {
  await browser.storage.local.set({ config })
}
