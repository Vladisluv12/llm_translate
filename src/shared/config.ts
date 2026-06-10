export interface ProviderProfile {
  id: string
  name: string
  apiUrl: string
  apiKey: string
  model: string
}

export interface ProviderConfig {
  // ---- Global / non-profile settings ----
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

  // ---- Profiles ----
  profiles: ProviderProfile[]
  activeProfileId: string

  // ---- Features ----
  scrollSyncEnabled: boolean
}

/**
 * The old flat shape (used only for migration detection).
 */
interface LegacyConfig {
  apiUrl?: string
  apiKey?: string
  model?: string
}

declare const __EXT_API_URL__: string
declare const __EXT_API_KEY__: string
declare const __EXT_MODEL__: string

const DEFAULT_PROFILES: ProviderProfile[] = [
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    apiUrl: __EXT_API_URL__,
    apiKey: __EXT_API_KEY__,
    model: __EXT_MODEL__,
  },
  {
    id: 'llama-local',
    name: 'Llama Local (Ollama)',
    apiUrl: 'http://localhost:11434/v1/chat/completions',
    apiKey: '',
    model: 'llama3.1',
  },
  {
    id: 'mistral-local',
    name: 'Mistral Local (Ollama)',
    apiUrl: 'http://localhost:11434/v1/chat/completions',
    apiKey: '',
    model: 'mistral:7b',
  },
]

export const DEFAULT_CONFIG: ProviderConfig = {
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
  profiles: DEFAULT_PROFILES,
  activeProfileId: 'nvidia',
  scrollSyncEnabled: true,
}

/**
 * Merge the active profile back into the base config.
 * Returns an object that looks exactly like the old flat ProviderConfig,
 * so worker.ts / pdf-viewer.ts / OpenAIClient need minimal changes.
 */
export function applyProfile(config: ProviderConfig): ProviderConfig & ProviderProfile {
  const profile =
    config.profiles.find(p => p.id === config.activeProfileId) ??
    config.profiles[0] ??
    DEFAULT_PROFILES[0]

  // Destructure out profile-specific fields so they don't shadow
  const { profiles, activeProfileId, ...base } = config

  return {
    ...base,
    ...profile,
    profiles,
    activeProfileId,
  }
}

export async function loadConfig(): Promise<ProviderConfig> {
  const stored = await browser.storage.local.get('config')
  const raw = (stored.config as (Partial<ProviderConfig> & LegacyConfig) | undefined) ?? {}

  // ---------- MIGRATION: old flat config → profile-based ----------
  if (raw.apiUrl !== undefined || raw.apiKey !== undefined || raw.model !== undefined) {
    const migratedProfile: ProviderProfile = {
      id: 'default',
      name: 'Default',
      apiUrl: raw.apiUrl ?? __EXT_API_URL__,
      apiKey: raw.apiKey ?? __EXT_API_KEY__,
      model: raw.model ?? __EXT_MODEL__,
    }

    // Remove legacy fields
    delete (raw as any).apiUrl
    delete (raw as any).apiKey
    delete (raw as any).model

    // Ensure default profile exists and is active
    const existingProfiles = Array.isArray(raw.profiles) ? raw.profiles : []
    const withoutDefault = existingProfiles.filter((p: any) => p.id !== 'default')
    raw.profiles = [migratedProfile, ...withoutDefault]
    raw.activeProfileId = 'default'

    // Persist the migrated shape immediately
    const migrated = { ...DEFAULT_CONFIG, ...raw }
    await browser.storage.local.set({ config: migrated })
    return migrated
  }

  return { ...DEFAULT_CONFIG, ...raw }
}

export async function saveConfig(config: ProviderConfig): Promise<void> {
  await browser.storage.local.set({ config })
}
