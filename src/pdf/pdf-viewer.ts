import * as pdfjsLib from 'pdfjs-dist'
import { ocr } from './ocr'
import { OpenAIClient } from '../background/openai-client'
import { loadConfig } from '../shared/config'
import { detectLang, langCodeToName, targetLangName } from '../shared/lang-detect'
import { renderSinglePrompt } from '../background/text-batcher'
import { RateLimitedQueue } from '../background/queue'

pdfjsLib.GlobalWorkerOptions.workerSrc = browser.runtime.getURL('chunks/pdf.worker.js')

const params = new URLSearchParams(location.search)
const pdfUrl = decodeURIComponent(params.get('url') ?? '')

const pdfPanel = document.getElementById('pdf-panel')!
const translationsEl = document.getElementById('translations')!
const statusEl = document.getElementById('status')!

const HEAP_WARN = 0.8
const HEAP_CRIT = 0.9

// TextItem is not re-exported from the main pdfjs-dist package, so define locally.
interface PdfTextItem {
  str: string
}

interface CachedPage {
  pageNum: number
  canvas: HTMLCanvasElement | null
  text: string
}

const pageCache = new Map<number, CachedPage>()
const canvasEls = new Map<number, HTMLCanvasElement>()

function checkMemory(): 'ok' | 'warn' | 'crit' {
  const mem = (performance as unknown as { memory?: { jsHeapSizeUsed: number; jsHeapSizeLimit: number } }).memory
  if (!mem) return 'ok'
  const ratio = mem.jsHeapSizeUsed / mem.jsHeapSizeLimit
  if (ratio > HEAP_CRIT) return 'crit'
  if (ratio > HEAP_WARN) return 'warn'
  return 'ok'
}

function evictCaches(currentPage: number, pressure: 'warn' | 'crit'): void {
  const threshold = pressure === 'crit' ? 2 : 5
  for (const [pageNum, cached] of pageCache.entries()) {
    if (Math.abs(pageNum - currentPage) > threshold && cached.canvas) {
      cached.canvas = null
      const el = canvasEls.get(pageNum)
      if (el) {
        el.width = 0   // Release GPU backing store
        el.height = 0  // Release GPU backing store
      }
    }
  }
  if (pressure === 'crit') ocr.terminate()
}

async function renderPage(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale: 1.5 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: canvas.getContext('2d')!, canvas, viewport }).promise
  canvasEls.set(pageNum, canvas)
  return canvas
}

async function extractPageText(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  canvas: HTMLCanvasElement
): Promise<string> {
  const page = await pdf.getPage(pageNum)
  const textContent = await page.getTextContent()
  const text = textContent.items
    .filter((item): item is typeof item & PdfTextItem => 'str' in item)
    .map(item => item.str)
    .join(' ')
    .trim()

  if (text.length >= 10) return text

  // Scanned page — run OCR
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const detectedLang = detectLang(text)
  const ocrLang = detectedLang === 'zh' ? 'chi_sim' : 'eng'
  return ocr.recognizePage(imageData, { lang: ocrLang })
}

async function main(): Promise<void> {
  if (!pdfUrl) { statusEl.textContent = 'No PDF URL provided.'; return }

  statusEl.textContent = 'Loading PDF...'
  const config = await loadConfig()
  const client = new OpenAIClient(config)
  const queue = new RateLimitedQueue({ maxRPS: config.maxRPS })
  const translationPanel = document.getElementById('translation-panel')!

  const pdf = await pdfjsLib.getDocument({ url: pdfUrl }).promise
  const numPages = pdf.numPages
  statusEl.textContent = `${numPages} pages — rendering...`

  const pagesInProgress = new Set<number>()

  const observer = new IntersectionObserver(async (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const pageNum = parseInt((entry.target as HTMLElement).dataset.page ?? '0', 10)
      if (!pageNum || pageCache.get(pageNum)?.text || pagesInProgress.has(pageNum)) continue

      const pressure = checkMemory()
      if (pressure !== 'ok') evictCaches(pageNum, pressure)

      pagesInProgress.add(pageNum)
      try {
        const canvas = canvasEls.get(pageNum)!
        const text = await extractPageText(pdf, pageNum, canvas)
        const cached = pageCache.get(pageNum)!
        cached.text = text

        const transEl = document.getElementById(`trans-${pageNum}`)!
        transEl.classList.add('loading')
        transEl.textContent = 'Translating...'

        const fromName = langCodeToName(config.sourceLang === 'auto' ? detectLang(text) : config.sourceLang)
        const toName = targetLangName()
        const prompt = renderSinglePrompt(config.singlePrompt, text, fromName, toName)

        try {
          const translated = await queue.enqueue(() => client.complete(config.systemPrompt, prompt))
          transEl.textContent = translated.trim()
          transEl.classList.remove('loading')
        } catch (err) {
          transEl.textContent = `Translation error: ${(err as Error).message}`
          transEl.classList.remove('loading')
        }
      } finally {
        pagesInProgress.delete(pageNum)
      }
    }
  }, { rootMargin: '200px' })

  for (let i = 1; i <= numPages; i++) {
    const pageWrapper = document.createElement('div')
    pageWrapper.dataset.page = String(i)
    pdfPanel.appendChild(pageWrapper)

    const canvas = await renderPage(pdf, i)
    pageWrapper.appendChild(canvas)
    pageCache.set(i, { pageNum: i, canvas, text: '' })

    const transWrapper = document.createElement('div')
    transWrapper.className = 'page-translation'
    const label = document.createElement('div')
    label.className = 'page-label'
    label.textContent = `Page ${i}`
    const transEl = document.createElement('div')
    transEl.id = `trans-${i}`
    transEl.className = 'page-text'
    transEl.textContent = 'Scroll to translate...'
    transWrapper.appendChild(label)
    transWrapper.appendChild(transEl)
    translationsEl.appendChild(transWrapper)

    observer.observe(pageWrapper)
  }

  // Sync scroll between panels — anchor-based
  let pdfRafPending = false
  pdfPanel.addEventListener('scroll', () => {
    if (pdfRafPending) return
    pdfRafPending = true
    requestAnimationFrame(() => {
      pdfRafPending = false
      const pdfPanelTop = pdfPanel.getBoundingClientRect().top
      const pageEls = pdfPanel.querySelectorAll<HTMLElement>('[data-page]')
      for (const pageEl of pageEls) {
        const rect = pageEl.getBoundingClientRect()
        if (rect.bottom > pdfPanelTop) {
          const pageNum = parseInt(pageEl.dataset.page!, 10)
          const anchorPx = Math.max(0, pdfPanelTop - rect.top)
          const transEl = document.getElementById(`trans-${pageNum}`)
          if (transEl) {
            const transElTop = transEl.getBoundingClientRect().top
              - translationPanel.getBoundingClientRect().top
              + translationPanel.scrollTop
            translationPanel.scrollTop = transElTop - anchorPx
          }
          break
        }
      }
    })
  }, { passive: true })

  // Memory pressure check every 10s
  setInterval(() => {
    const currentPageEl = [...pdfPanel.querySelectorAll('[data-page]')]
      .find(el => el.getBoundingClientRect().top >= 0) as HTMLElement | undefined
    const currentPage = parseInt(currentPageEl?.dataset.page ?? '1', 10)
    const pressure = checkMemory()
    if (pressure !== 'ok') evictCaches(currentPage, pressure)
  }, 10000)

  statusEl.textContent = `${numPages} pages loaded — scroll to translate`
}

main().catch(err => { statusEl.textContent = `Error: ${(err as Error).message}` })
