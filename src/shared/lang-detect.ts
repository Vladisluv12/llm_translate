import { franc } from 'franc-min'

const LANG_MAP: Record<string, 'en' | 'zh'> = {
  eng: 'en',
  cmn: 'zh',  // Mandarin Chinese
  yue: 'zh',  // Cantonese
  zho: 'zh',
}

export function detectLang(text: string): 'en' | 'zh' {
  if (!text || text.length < 10) return 'en'
  const detected = franc(text.slice(0, 300))
  return LANG_MAP[detected] ?? 'en'
}

export function langCodeToName(code: 'en' | 'zh' | 'auto'): string {
  return { en: 'English', zh: 'Chinese', auto: 'Auto' }[code]
}

export function targetLangName(): string {
  return 'Russian'
}
