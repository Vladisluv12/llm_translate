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

async function extractWithRetry(tabId: number): Promise<Array<{id:string;text:string}> | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    log.debug('extraction attempt', { attempt })
    try {
      const [{ result: blocks }] = await browser.scripting.executeScript({
        target: { tabId },
        func: (function() {
          const SELECTORS = 'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, figcaption';
          const SKIP_TAGS = ['code', 'pre', 'script', 'style', 'noscript'];
          const MIN_WORDS = 3;

          function hasSkippedParent(el: Element): boolean {
            let node: Element | null = el;
            while (node) {
              if (SKIP_TAGS.indexOf(node.tagName.toLowerCase()) !== -1) return true;
              node = node.parentElement;
            }
            return false;
          }

          try {
            const root = document.body;
            if (!root) return { error: 'no body' };
            const elements = Array.from(root.querySelectorAll(SELECTORS));
            if (elements.length === 0) {
              return { error: 'no elements', bodyChildren: root.children.length, tagName: root.tagName };
            }
            const results: Array<{id: string, text: string}> = [];
            let idCounter = 0;

            for (let i = 0; i < elements.length; i++) {
              const el = elements[i];
              const text = el.textContent ? el.textContent.trim() : '';
              const wordCount = text.split(/\s+/).filter((w: string) => w.length > 0).length;
              if (wordCount < MIN_WORDS) continue;
              if (hasSkippedParent(el)) continue;
              const id = 'zt-' + (++idCounter);
              el.setAttribute('data-zt-id', id);
              results.push({ id: id, text: text });
            }
            return { blocks: results };
          } catch (e: unknown) {
            return { error: String(e) };
          }
        }) as unknown as () => void,
      }) as unknown as [{ result: { blocks?: Array<{id:string;text:string}>, error?: string, bodyChildren?: number, tagName?: string } | null }]

      if (blocks && typeof blocks === 'object' && 'blocks' in blocks && Array.isArray(blocks.blocks) && blocks.blocks.length > 0) {
        log.info('extraction succeeded', { attempt, count: blocks.blocks.length })
        return blocks.blocks
      }
      if (blocks && typeof blocks === 'object' && 'error' in blocks) {
        log.warn('extraction error', { attempt, ...blocks })
      } else {
        log.warn('extraction returned empty', { attempt, blocks })
      }
    } catch (e) {
      log.warn('extraction threw', { attempt, error: String(e) })
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, 500))
  }
  return null
}

interface ActiveTranslation {
  translationWindowId: number
  aborted: boolean
}

const active = new Map<number, ActiveTranslation>()

// Register context menu on install
browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.removeAll().then(() => {
    browser.contextMenus.create({
      id: 'translate-selection',
      title: 'Перевести выделенный текст',
      contexts: ['selection'],
    })
  }).catch(() => {})
})

// Handle context menu click
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'translate-selection' || !tab?.id || !info.selectionText) return

  const config = applyProfile(await loadConfig())
  const client = new OpenAIClient(config)
  const queue = new RateLimitedQueue({ maxRPS: config.maxRPS })

  const fromName = langCodeToName(config.sourceLang === 'auto' ? detectLang(info.selectionText) : config.sourceLang)
  const toName = targetLangName()
  const prompt = renderSinglePrompt(config.singlePrompt, info.selectionText, fromName, toName)

  try {
    const translated = await queue.enqueue(() => client.complete(config.systemPrompt, prompt))
    log.debug('selection translated, sending to tab', { tabId: tab.id, contentLen: translated.trim().length })
    await browser.tabs.sendMessage(tab.id, {
      type: 'SELECTION_TRANSLATED',
      originalText: info.selectionText,
      translatedText: translated.trim(),
      from: fromName,
      to: toName,
    } as Message)
    log.debug('SELECTION_TRANSLATED sent to tab')
  } catch (err) {
    log.warn('selection translation error, sending error to tab', { tabId: tab.id, error: String(err) })
    await browser.tabs.sendMessage(tab.id, {
      type: 'SELECTION_TRANSLATED',
      originalText: info.selectionText,
      translatedText: `[Ошибка перевода: ${(err as Error).message}]`,
      from: fromName,
      to: toName,
    } as Message)
  }
})

// Handle translate-selection hotkey
browser.commands.onCommand.addListener(async (command) => {
  if (command === 'translate-selection') {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return
    const [{ result: selection }] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: (() => window.getSelection()?.toString() ?? '') as unknown as () => void,
    }) as unknown as [{ result: string }]
    if (!selection || selection.trim().length < 2) return

    const config = applyProfile(await loadConfig())
    const client = new OpenAIClient(config)
    const queue = new RateLimitedQueue({ maxRPS: config.maxRPS })

    const fromName = langCodeToName(config.sourceLang === 'auto' ? detectLang(selection) : config.sourceLang)
    const toName = targetLangName()
    const prompt = renderSinglePrompt(config.singlePrompt, selection, fromName, toName)

    try {
      const translated = await queue.enqueue(() => client.complete(config.systemPrompt, prompt))
      await browser.tabs.sendMessage(tab.id, {
        type: 'SELECTION_TRANSLATED',
        originalText: selection,
        translatedText: translated.trim(),
        from: fromName,
        to: toName,
      } as Message)
    } catch (err) {
      await browser.tabs.sendMessage(tab.id, {
        type: 'SELECTION_TRANSLATED',
        originalText: selection,
        translatedText: `[Ошибка перевода: ${(err as Error).message}]`,
        from: fromName,
        to: toName,
      } as Message)
    }
    return
  }

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
    // Relay CLICK_SYNC from content script to translation window
    if (msg.type === 'CLICK_SYNC' && sender.tab?.id) {
      const state = active.get(sender.tab.id)
      if (state) {
        sendToTranslationWindow(state.translationWindowId, msg).catch(() => {})
      }
    }
    return false
  }
)

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
  log.debug('cache lookup', { sourceUrl, found: !!cachedPage })
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
  const typedBlocks = await extractWithRetry(tabId)
  if (!typedBlocks) {
    log.error('extraction failed after retries')
    await sendToTranslationWindow(translationWindowId, {
      type: 'TRANSLATION_ERROR',
      message: 'Could not extract text from this page. Try reloading the page.',
    })
    return
  }
  log.info('extracted blocks', { count: typedBlocks.length })

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

    log.info('translation batches', { totalBatches: batches.length, blocks: typedBlocks.length, maxRPS: config.maxRPS })

    let done = 0

    for (const batch of batches) {
      if (state.aborted) { log.info('translation aborted'); break }

      log.debug('batch starting', { batchIndex: batches.indexOf(batch), batchSize: batch.length, done })
      const batchStartTime = Date.now()

      const userPrompt =
        renderMultiplePrompt(config.multiplePrompt + contextSuffix, batch, fromName, toName)
      const systemPrompt = config.systemPrompt

      try {
        const raw = await queue.enqueue(() => client.complete(systemPrompt, userPrompt))
        const batchTime = Date.now() - batchStartTime
        log.debug('batch completed', { batchIndex: batches.indexOf(batch), timeMs: batchTime, done })

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
      log.info('translation complete', { total: typedBlocks.length, cached: cacheAccumulator.length })
      await sendToTranslationWindow(translationWindowId, { type: 'TRANSLATION_DONE' })
      if (cacheAccumulator.length === typedBlocks.length) {
        try {
          await setPageCache(sourceUrl, { cachedAt: Date.now(), blocks: cacheAccumulator })
          log.info('cache saved', { blocks: cacheAccumulator.length })
        } catch (e) {
          log.warn('cache save failed', { error: String(e) })
        }
      } else {
        log.warn('cache NOT saved - counts mismatch', { accumulated: cacheAccumulator.length, total: typedBlocks.length })
      }
    } else {
      log.warn('translation aborted, cache NOT saved')
    }
  active.delete(tabId)
}

async function sendToTranslationWindow(windowId: number, msg: Message): Promise<void> {
  const tabs = await browser.tabs.query({ windowId })
  for (const tab of tabs) {
    if (tab.id) {
      await browser.tabs.sendMessage(tab.id, msg).catch(() => {})
    }
  }
}
