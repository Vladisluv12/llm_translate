import { loadConfig, applyProfile } from '../shared/config'
import { getPageCache, setPageCache } from '../shared/translation-cache'
import { OpenAIClient } from './openai-client'
import { RateLimitedQueue } from './queue'
import { batchBlocks, renderMultiplePrompt, renderSinglePrompt, parseMultipleResponse } from './text-batcher'
import { openSplitTranslation, closeSplitIfOpen } from './window-manager'
import { analyzePageContext } from './context-analyzer'
import { detectLang, langCodeToName, targetLangName } from '../shared/lang-detect'
import type { Message, TranslationBlock as _TranslationBlock } from '../shared/messages'

import { createLogger } from '../shared/logger'

const log = createLogger('worker')

interface ActiveTranslation {
  translationWindowId: number
  aborted: boolean
}

const active = new Map<number, ActiveTranslation>()

browser.runtime.onMessage.addListener(
  (msg: Message, sender) => {
    if (msg.type === 'START_TRANSLATION') {
      log.info('START_TRANSLATION received', { tabId: msg.tabId, sourceUrl: msg.sourceUrl })
      if (!active.has(msg.tabId)) {
        startTranslation(msg.tabId, msg.sourceUrl).catch(err => log.error('startTranslation threw', { error: String(err) }))
      }
    }
    if (msg.type === 'STOP_TRANSLATION' && sender.tab?.id) {
      log.info('STOP_TRANSLATION received', { tabId: sender.tab.id })
      const state = active.get(sender.tab.id)
      if (state) {
        state.aborted = true
        closeSplitIfOpen(state.translationWindowId).catch(console.error)
        active.delete(sender.tab.id)
      }
    }
    return false
  }
)

browser.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-translation') return
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url) return

  if (active.has(tab.id)) {
    log.info('toggle: stopping translation', { tabId: tab.id })
    const state = active.get(tab.id)!
    state.aborted = true
    await closeSplitIfOpen(state.translationWindowId)
    active.delete(tab.id)
  } else {
    log.info('toggle: starting translation', { tabId: tab.id, url: tab.url })
    await startTranslation(tab.id, tab.url)
  }
})

async function startTranslation(tabId: number, sourceUrl: string): Promise<void> {
  log.info('startTranslation', { tabId, sourceUrl })
  const config = applyProfile(await loadConfig())
  const client = new OpenAIClient(config)
  const queue = new RateLimitedQueue({ maxRPS: config.maxRPS })

  const translationUrl = browser.runtime.getURL('translation/translation.html')
  const { translationWindowId } = await openSplitTranslation(tabId, translationUrl)

  const state: ActiveTranslation = { translationWindowId, aborted: false }
  active.set(tabId, state)

  // Cache hit: replay instantly without calling API
  const cachedPage = await getPageCache(sourceUrl)
  if (cachedPage) {
    log.info('cache hit, replaying', { blocks: cachedPage.blocks.length })
    for (const block of cachedPage.blocks) {
      if (state.aborted) break
      await sendToTranslationWindow(translationWindowId, {
        type: 'TRANSLATION_BLOCK',
        block: { id: block.id, originalText: block.originalText, translatedText: block.translatedText },
      })
    }
    if (!state.aborted) {
      await sendToTranslationWindow(translationWindowId, { type: 'TRANSLATION_DONE' })
    }
    active.delete(tabId)
    return
  }

  log.info('cache miss, extracting from page')
  try {
    // Extract text blocks from the page
    let typedBlocks: Array<{ id: string; text: string }>
    try {
      const [{ result: blocks }] = await browser.scripting.executeScript({
        target: { tabId },
        func: (() => {
          return (window as unknown as { __ztExtract: () => Array<{id:string;text:string}> }).__ztExtract()
        }) as unknown as () => void,
      }) as unknown as [{ result: Array<{id:string;text:string}> | null }]
      if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
        log.warn('extraction returned empty', { blocks })
        await sendToTranslationWindow(translationWindowId, {
          type: 'TRANSLATION_ERROR',
          message: 'Could not extract text from this page. Try reloading the page.',
        })
        return
      }
      log.info('extracted blocks', { count: blocks.length })
      typedBlocks = blocks as Array<{ id: string; text: string }>
    } catch (extractErr) {
      log.error('extraction threw', { error: String(extractErr) })
      await sendToTranslationWindow(translationWindowId, {
        type: 'TRANSLATION_ERROR',
        message: 'Could not access this page. Please reload and try again.',
      })
      return
    }

    const cacheAccumulator: Array<{ id: string; originalText: string; translatedText: string }> = []

    const allText = typedBlocks.map(b => b.text).join(' ')
    const detectedLang = config.sourceLang === 'auto' ? detectLang(allText) : config.sourceLang
    const fromName = langCodeToName(detectedLang)
    const toName = targetLangName()

    // AI context-aware pre-pass
    let contextSuffix = ''
    if (config.aiContextAware) {
      const [{ result: titleResult }] = await browser.scripting.executeScript({
        target: { tabId },
        func: (() => document.title) as unknown as () => void,
      }) as unknown as [{ result: string }]
      const ctx = await analyzePageContext(client, titleResult as string, allText)
      if (ctx.theme) contextSuffix = `\n\nDocument topic: ${ctx.theme}`
      if (Object.keys(ctx.terms).length > 0) {
        const termsStr = Object.entries(ctx.terms).map(([k, v]) => `${k} → ${v}`).join(', ')
        contextSuffix += `\nKey terms: ${termsStr}`
      }
    }

    const batches = batchBlocks(typedBlocks, {
      maxParagraphs: config.maxParagraphsPerRequest,
      maxLength: config.maxTextLengthPerRequest,
    })

    const totalMsg: Message = { type: 'TRANSLATION_PROGRESS', done: 0, total: typedBlocks.length }
    await sendToTranslationWindow(translationWindowId, totalMsg)

    let done = 0

    for (const batch of batches) {
      if (state.aborted) { log.info('translation aborted'); break }

      const userPrompt =
        renderMultiplePrompt(config.multiplePrompt + contextSuffix, batch, fromName, toName)
      const systemPrompt = config.systemPrompt

      try {
        const raw = await queue.enqueue(() => client.complete(systemPrompt, userPrompt))
        const translations = parseMultipleResponse(raw)

        for (const item of batch) {
          const translatedText = translations.get(item.id) ?? item.text
          done++
          const blockMsg: Message = {
            type: 'TRANSLATION_BLOCK',
            block: { id: item.id, originalText: item.text, translatedText },
          }
          await sendToTranslationWindow(translationWindowId, blockMsg)
          cacheAccumulator.push({ id: item.id, originalText: item.text, translatedText })
        }
      } catch (err) {
        log.warn('batch failed, retrying individually', { error: String(err), batchSize: batch.length })
        // If batch fails, try individual paragraphs
        for (const item of batch) {
          if (state.aborted) break
          try {
            const singlePrompt = renderSinglePrompt(config.singlePrompt, item.text, fromName, toName)
            const raw = await queue.enqueue(() => client.complete(config.systemPrompt, singlePrompt))
            done++
            const blockMsg: Message = {
              type: 'TRANSLATION_BLOCK',
              block: { id: item.id, originalText: item.text, translatedText: raw.trim() },
            }
            await sendToTranslationWindow(translationWindowId, blockMsg)
            cacheAccumulator.push({ id: item.id, originalText: item.text, translatedText: raw.trim() })
          } catch (itemErr) {
            log.error('item translation failed', { id: item.id, error: String(itemErr) })
            done++
            const errorMsg: Message = {
              type: 'TRANSLATION_BLOCK',
              block: { id: item.id, originalText: item.text, translatedText: `[Translation failed]` },
            }
            await sendToTranslationWindow(translationWindowId, errorMsg)
          }
        }
      }

      const progressMsg: Message = { type: 'TRANSLATION_PROGRESS', done, total: typedBlocks.length }
      await sendToTranslationWindow(translationWindowId, progressMsg)
    }

    if (!state.aborted) {
      log.info('translation complete', { total: typedBlocks.length })
      await sendToTranslationWindow(translationWindowId, { type: 'TRANSLATION_DONE' })
      if (cacheAccumulator.length === typedBlocks.length) {
        try {
          await setPageCache(sourceUrl, { cachedAt: Date.now(), blocks: cacheAccumulator })
        } catch { /* storage quota exceeded — translation succeeded, cache skipped */ }
      }
    }
  } finally {
    active.delete(tabId)
  }
}

async function sendToTranslationWindow(windowId: number, msg: Message): Promise<void> {
  const tabs = await browser.tabs.query({ windowId })
  for (const tab of tabs) {
    if (tab.id) {
      await browser.tabs.sendMessage(tab.id, msg).catch(() => {})
    }
  }
}
