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
  | { type: 'SCROLL_SYNC'; anchorId: string; anchorPx: number }
  | { type: 'GET_PROGRESS' }
  | { type: 'STOP_TRANSLATION' }
  | { type: 'TRANSLATE_SELECTION'; text: string; tabId: number }
  | { type: 'SELECTION_TRANSLATED'; originalText: string; translatedText: string; from: string; to: string }
  | { type: 'CLICK_SYNC'; anchorId: string }
  | { type: 'CLICK_SYNC_BACK'; anchorId: string }
