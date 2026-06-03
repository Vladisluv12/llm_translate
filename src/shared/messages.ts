export type TranslationBlock = {
  id: string
  originalText: string
  translatedText?: string
}

export type Message =
  | { type: 'START_TRANSLATION'; tabId: number; sourceUrl: string }
  | { type: 'TRANSLATION_BLOCK'; block: TranslationBlock }
  | { type: 'TRANSLATION_PROGRESS'; done: number; total: number }
  | { type: 'TRANSLATION_DONE' }
  | { type: 'TRANSLATION_ERROR'; message: string }
  | { type: 'SCROLL_SYNC'; ratio: number }
  | { type: 'GET_PROGRESS' }
  | { type: 'STOP_TRANSLATION' }
