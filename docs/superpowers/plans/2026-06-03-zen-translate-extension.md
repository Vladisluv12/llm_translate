# Zen Translate Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Firefox/Zen browser extension that translates websites (EN/ZH → RU) using a local OpenAI-compatible API (Ollama), displaying results in a split-screen window alongside the original.

**Architecture:** Background service worker owns all AI calls via an OpenAI-compatible client with batching, rate limiting, and retry. Content script extracts DOM text blocks and syncs scroll. Split-screen is achieved by resizing the current browser window and opening a translation window on the right half via `browser.windows` API. PDF support uses PDF.js + Tesseract.js with lazy per-page translation and LRU memory management.

**Tech Stack:** TypeScript, Vite (multi-entry), Vitest + happy-dom, `pdfjs-dist`, `tesseract.js`, `franc-min`, `webextension-polyfill`, `web-ext`

---

## File Structure

```
src/
  shared/
    config.ts          — settings schema, defaults, browser.storage read/write
    messages.ts        — typed message union for runtime.sendMessage
    lang-detect.ts     — language detection (franc-min wrapper)
  background/
    worker.ts          — service worker entry: routes messages, owns AI pipeline
    openai-client.ts   — OpenAI-compatible HTTP client (fetch + streaming)
    queue.ts           — token-bucket rate limiter + retry queue
    text-batcher.ts    — batches paragraphs into JSON requests
    window-manager.ts  — browser.windows split-screen logic
    context-analyzer.ts— AI context-aware pre-pass (page theme + terms)
  content/
    content.ts         — content script entry: extracts text, handles hotkey, scroll sync
    extractor.ts       — pure DOM → TextBlock[] extraction
  translation/
    translation.html
    translation.ts     — receives translated blocks, renders, syncs scroll
  pdf/
    pdf-viewer.html
    pdf-viewer.ts      — PDF.js renderer + OCR orchestration + translation
    ocr.ts             — Tesseract.js wrapper with idle-terminate + LRU eviction
  popup/
    popup.html
    popup.ts
  settings/
    settings.html
    settings.ts
tests/
  config.test.ts
  openai-client.test.ts
  queue.test.ts
  text-batcher.test.ts
  extractor.test.ts
  lang-detect.test.ts
manifest.json
vite.config.ts
tsconfig.json
package.json
vitest.config.ts
```

---

## Phase 1: Foundation

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `manifest.json`

- [ ] **Step 1: Initialize package.json**

```bash
cd "/home/vladozz/Рабочий стол/projects/translate_extension"
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install pdfjs-dist tesseract.js franc-min webextension-polyfill
npm install -D typescript vite vitest @vitest/coverage-v8 happy-dom web-ext @types/firefox-webext-browser
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["firefox-webext-browser"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 4: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import { resolve } from 'path'
import { copyFileSync, mkdirSync } from 'fs'

// Plugin to copy PDF.js worker into dist/chunks/ after build
const copyPdfjsWorker = {
  name: 'copy-pdfjs-worker',
  closeBundle() {
    mkdirSync('dist/chunks', { recursive: true })
    copyFileSync(
      resolve(__dirname, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
      resolve(__dirname, 'dist/chunks/pdf.worker.js')
    )
  },
}

export default defineConfig({
  plugins: [copyPdfjsWorker],
  build: {
    rollupOptions: {
      input: {
        worker: resolve(__dirname, 'src/background/worker.ts'),
        content: resolve(__dirname, 'src/content/content.ts'),
        translation: resolve(__dirname, 'src/translation/translation.html'),
        popup: resolve(__dirname, 'src/popup/popup.html'),
        settings: resolve(__dirname, 'src/settings/settings.html'),
        'pdf-viewer': resolve(__dirname, 'src/pdf/pdf-viewer.html'),
      },
      output: {
        entryFileNames: '[name]/[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    target: 'firefox115',
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
  },
})
```

- [ ] **Step 5: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
})
```

- [ ] **Step 6: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Zen Translate",
  "version": "0.1.0",
  "description": "Split-screen translation powered by local AI (Ollama)",
  "background": {
    "scripts": ["background/worker.js"],
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/content.js"],
      "run_at": "document_idle",
      "exclude_matches": ["moz-extension://*/*"]
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_title": "Zen Translate"
  },
  "commands": {
    "toggle-translation": {
      "suggested_key": { "default": "Alt+A" },
      "description": "Toggle page translation"
    }
  },
  "permissions": ["activeTab", "tabs", "windows", "storage", "scripting"],
  "host_permissions": ["<all_urls>"],
  "web_accessible_resources": [
    {
      "resources": ["translation/*", "pdf/*", "chunks/*", "assets/*"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

- [ ] **Step 7: Create src directories**

```bash
mkdir -p src/{shared,background,content,translation,pdf,popup,settings} tests
```

- [ ] **Step 8: Verify build works (empty entry points)**

Create a minimal `src/background/worker.ts`:
```typescript
export {}
```

```bash
npx vite build
```
Expected: `dist/` created, no errors.

- [ ] **Step 9: Commit**

```bash
git init
echo "dist/\nnode_modules/\n.superpowers/" > .gitignore
git add .
git commit -m "feat: project scaffolding — vite, typescript, manifest v3"
```

---

### Task 2: Shared types and config

**Files:**
- Create: `src/shared/messages.ts`
- Create: `src/shared/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write failing test for config defaults**

```typescript
// tests/config.test.ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG, loadConfig, saveConfig } from '../src/shared/config'

describe('DEFAULT_CONFIG', () => {
  it('has correct Ollama endpoint', () => {
    expect(DEFAULT_CONFIG.apiUrl).toBe('http://localhost:11434/v1/chat/completions')
  })

  it('has llama3.1 as default model', () => {
    expect(DEFAULT_CONFIG.model).toBe('llama3.1')
  })

  it('has 120s timeout', () => {
    expect(DEFAULT_CONFIG.requestTimeout).toBe(120)
  })

  it('has maxRPS of 5', () => {
    expect(DEFAULT_CONFIG.maxRPS).toBe(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/config.test.ts
```
Expected: FAIL — "Cannot find module '../src/shared/config'"

- [ ] **Step 3: Create src/shared/config.ts**

```typescript
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
    'Translate the paragraphs from {{from}} to {{to}}. Return ONLY a valid JSON array with the same structure, replacing each "text" value with its Russian translation. No extra text.\n\n{{json}}',
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
```

- [ ] **Step 4: Create src/shared/messages.ts**

```typescript
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
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/config.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/shared/ tests/config.test.ts
git commit -m "feat: shared config schema and message types"
```

---

### Task 3: Language detection

**Files:**
- Create: `src/shared/lang-detect.ts`
- Create: `tests/lang-detect.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/lang-detect.test.ts
import { describe, it, expect } from 'vitest'
import { detectLang } from '../src/shared/lang-detect'

describe('detectLang', () => {
  it('detects English', () => {
    expect(detectLang('The quick brown fox jumps over the lazy dog. This is a longer text to help detection.')).toBe('en')
  })

  it('detects Chinese', () => {
    expect(detectLang('这是一段中文文字，用于测试语言检测功能是否正常工作。')).toBe('zh')
  })

  it('falls back to en for unknown short text', () => {
    expect(detectLang('xyz')).toBe('en')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/lang-detect.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create src/shared/lang-detect.ts**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/lang-detect.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shared/lang-detect.ts tests/lang-detect.test.ts
git commit -m "feat: language detection with franc-min"
```

---

### Task 4: DOM text extractor

**Files:**
- Create: `src/content/extractor.ts`
- Create: `tests/extractor.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/extractor.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { extractTextBlocks, TRANSLATABLE_SELECTORS } from '../src/content/extractor'

describe('extractTextBlocks', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('extracts paragraphs with unique ids', () => {
    document.body.innerHTML = `
      <p>Hello world</p>
      <p>Second paragraph</p>
    `
    const blocks = extractTextBlocks(document.body)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].text).toBe('Hello world')
    expect(blocks[0].id).toBeTruthy()
    expect(blocks[1].id).not.toBe(blocks[0].id)
  })

  it('skips code blocks', () => {
    document.body.innerHTML = `
      <p>Normal text</p>
      <pre><code>const x = 1</code></pre>
    `
    const blocks = extractTextBlocks(document.body)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('Normal text')
  })

  it('skips elements with less than 3 words', () => {
    document.body.innerHTML = '<p>Hi</p><p>This is real content here</p>'
    const blocks = extractTextBlocks(document.body)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('This is real content here')
  })

  it('assigns data-zt-id to each element', () => {
    document.body.innerHTML = '<p>Some text here for testing</p>'
    const blocks = extractTextBlocks(document.body)
    const el = document.querySelector('[data-zt-id]')
    expect(el).not.toBeNull()
    expect(el!.getAttribute('data-zt-id')).toBe(blocks[0].id)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/extractor.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create src/content/extractor.ts**

```typescript
export const TRANSLATABLE_SELECTORS =
  'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, figcaption'

const SKIP_PARENTS = new Set(['code', 'pre', 'script', 'style', 'noscript'])

export interface TextBlock {
  id: string
  text: string
  element: Element
}

let idCounter = 0

function hasSkippedParent(el: Element): boolean {
  let node: Element | null = el
  while (node) {
    if (SKIP_PARENTS.has(node.tagName.toLowerCase())) return true
    node = node.parentElement
  }
  return false
}

export function extractTextBlocks(root: Element = document.body): TextBlock[] {
  const elements = Array.from(root.querySelectorAll(TRANSLATABLE_SELECTORS))
  const blocks: TextBlock[] = []

  for (const el of elements) {
    const text = el.textContent?.trim() ?? ''
    if (text.split(/\s+/).length < 3) continue
    if (hasSkippedParent(el)) continue

    const id = `zt-${++idCounter}`
    el.setAttribute('data-zt-id', id)
    blocks.push({ id, text, element: el })
  }

  return blocks
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/extractor.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/content/extractor.ts tests/extractor.test.ts
git commit -m "feat: DOM text block extractor with data-zt-id tagging"
```

---

### Task 5: Text batcher

**Files:**
- Create: `src/background/text-batcher.ts`
- Create: `tests/text-batcher.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/text-batcher.test.ts
import { describe, it, expect } from 'vitest'
import { batchBlocks, renderMultiplePrompt, parseMultipleResponse } from '../src/background/text-batcher'

const blocks = Array.from({ length: 12 }, (_, i) => ({
  id: `zt-${i}`,
  text: `Paragraph number ${i} with some content here`,
}))

describe('batchBlocks', () => {
  it('splits into batches respecting maxParagraphs', () => {
    const batches = batchBlocks(blocks, { maxParagraphs: 5, maxLength: 10000 })
    expect(batches).toHaveLength(3)
    expect(batches[0]).toHaveLength(5)
    expect(batches[2]).toHaveLength(2)
  })

  it('splits into batches respecting maxLength', () => {
    const batches = batchBlocks(blocks, { maxParagraphs: 100, maxLength: 100 })
    // each block ~40 chars, so max 2 per batch
    for (const batch of batches) {
      const totalLen = batch.reduce((acc, b) => acc + b.text.length, 0)
      expect(totalLen).toBeLessThanOrEqual(100)
    }
  })
})

describe('renderMultiplePrompt', () => {
  it('renders JSON into prompt template', () => {
    const batch = [{ id: 'zt-0', text: 'Hello world test' }]
    const result = renderMultiplePrompt(
      'Translate {{from}} to {{to}}:\n\n{{json}}',
      batch,
      'English',
      'Russian'
    )
    expect(result).toContain('"id": "zt-0"')
    expect(result).toContain('English')
    expect(result).toContain('Russian')
  })
})

describe('parseMultipleResponse', () => {
  it('parses valid JSON array response', () => {
    const raw = '[{"id":"zt-0","text":"Привет мир"},{"id":"zt-1","text":"Второй абзац"}]'
    const result = parseMultipleResponse(raw)
    expect(result.get('zt-0')).toBe('Привет мир')
    expect(result.get('zt-1')).toBe('Второй абзац')
  })

  it('extracts JSON from response with extra text', () => {
    const raw = 'Here is the translation:\n[{"id":"zt-0","text":"Привет"}]\nDone.'
    const result = parseMultipleResponse(raw)
    expect(result.get('zt-0')).toBe('Привет')
  })

  it('returns empty map for unparseable response', () => {
    const result = parseMultipleResponse('not json at all')
    expect(result.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/text-batcher.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create src/background/text-batcher.ts**

```typescript
export interface BatchItem {
  id: string
  text: string
}

interface BatchOptions {
  maxParagraphs: number
  maxLength: number
}

export function batchBlocks(blocks: BatchItem[], opts: BatchOptions): BatchItem[][] {
  const batches: BatchItem[][] = []
  let current: BatchItem[] = []
  let currentLen = 0

  for (const block of blocks) {
    const blockLen = block.text.length
    const wouldExceedLen = currentLen + blockLen > opts.maxLength && current.length > 0
    const wouldExceedCount = current.length >= opts.maxParagraphs

    if (wouldExceedLen || wouldExceedCount) {
      batches.push(current)
      current = []
      currentLen = 0
    }

    current.push(block)
    currentLen += blockLen
  }

  if (current.length > 0) batches.push(current)
  return batches
}

export function renderMultiplePrompt(
  template: string,
  batch: BatchItem[],
  from: string,
  to: string
): string {
  const json = JSON.stringify(
    batch.map(b => ({ id: b.id, text: b.text })),
    null,
    2
  )
  return template
    .replace('{{from}}', from)
    .replace('{{to}}', to)
    .replace('{{json}}', json)
}

export function renderSinglePrompt(template: string, text: string, from: string, to: string): string {
  return template.replace('{{from}}', from).replace('{{to}}', to).replace('{{text}}', text)
}

export function parseMultipleResponse(raw: string): Map<string, string> {
  const result = new Map<string, string>()
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return result

  try {
    const parsed = JSON.parse(match[0]) as Array<{ id: string; text: string }>
    for (const item of parsed) {
      if (item.id && item.text) result.set(item.id, item.text)
    }
  } catch {
    // unparseable — return empty map
  }

  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/text-batcher.test.ts
```
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/background/text-batcher.ts tests/text-batcher.test.ts
git commit -m "feat: paragraph batcher and JSON prompt renderer/parser"
```

---

### Task 6: Rate limiter and retry queue

**Files:**
- Create: `src/background/queue.ts`
- Create: `tests/queue.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/queue.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RateLimitedQueue } from '../src/background/queue'

describe('RateLimitedQueue', () => {
  beforeEach(() => { vi.useFakeTimers() })

  it('executes task immediately when under rate limit', async () => {
    const q = new RateLimitedQueue({ maxRPS: 10 })
    const fn = vi.fn().mockResolvedValue('result')
    const result = await q.enqueue(fn)
    expect(fn).toHaveBeenCalledOnce()
    expect(result).toBe('result')
  })

  it('retries on 429 with backoff', async () => {
    const q = new RateLimitedQueue({ maxRPS: 10 })
    let calls = 0
    const fn = vi.fn().mockImplementation(async () => {
      calls++
      if (calls < 3) throw Object.assign(new Error('rate limit'), { status: 429 })
      return 'ok'
    })

    const promise = q.enqueue(fn)
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws after max retries exceeded', async () => {
    const q = new RateLimitedQueue({ maxRPS: 10, maxRetries: 2 })
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('fail'), { status: 429 }))

    const promise = q.enqueue(fn)
    await vi.runAllTimersAsync()
    await expect(promise).rejects.toThrow('fail')
    expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/queue.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create src/background/queue.ts**

```typescript
interface QueueOptions {
  maxRPS: number
  maxRetries?: number
}

export class RateLimitedQueue {
  private tokens: number
  private lastRefill: number
  private readonly maxRPS: number
  private readonly maxRetries: number

  constructor(opts: QueueOptions) {
    this.maxRPS = opts.maxRPS
    this.maxRetries = opts.maxRetries ?? 4
    this.tokens = opts.maxRPS
    this.lastRefill = Date.now()
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    this.tokens = Math.min(this.maxRPS, this.tokens + elapsed * this.maxRPS)
    this.lastRefill = now
  }

  private async waitForToken(): Promise<void> {
    this.refill()
    if (this.tokens >= 1) {
      this.tokens -= 1
      return
    }
    const waitMs = ((1 - this.tokens) / this.maxRPS) * 1000
    await new Promise(resolve => setTimeout(resolve, waitMs))
    this.tokens = 0
  }

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitForToken()

    let attempt = 0
    while (true) {
      try {
        return await fn()
      } catch (err: unknown) {
        const status = (err as { status?: number }).status
        if (status === 429 && attempt < this.maxRetries) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 30000)
          await new Promise(resolve => setTimeout(resolve, backoff))
          attempt++
        } else {
          throw err
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/queue.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/background/queue.ts tests/queue.test.ts
git commit -m "feat: token-bucket rate limiter with exponential backoff retry"
```

---

### Task 7: OpenAI-compatible client

**Files:**
- Create: `src/background/openai-client.ts`
- Create: `tests/openai-client.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/openai-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAIClient } from '../src/background/openai-client'

const mockConfig = {
  apiUrl: 'http://localhost:11434/v1/chat/completions',
  apiKey: '',
  model: 'llama3.1',
  temperature: 0.1,
  requestTimeout: 30,
}

describe('OpenAIClient', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('sends correct request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Перевод текста' } }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = new OpenAIClient(mockConfig)
    await client.complete('system msg', 'user msg')

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    const body = JSON.parse(opts.body as string)
    expect(body.model).toBe('llama3.1')
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[1].role).toBe('user')
    expect(body.temperature).toBe(0.1)
  })

  it('returns response text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Привет мир' } }],
      }),
    }))

    const client = new OpenAIClient(mockConfig)
    const result = await client.complete('sys', 'user')
    expect(result).toBe('Привет мир')
  })

  it('throws with status on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    }))

    const client = new OpenAIClient(mockConfig)
    await expect(client.complete('sys', 'user')).rejects.toMatchObject({ status: 429 })
  })

  it('throws on timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 200))
    ))

    const client = new OpenAIClient({ ...mockConfig, requestTimeout: 0.05 })
    await expect(client.complete('sys', 'user')).rejects.toThrow(/timeout/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/openai-client.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create src/background/openai-client.ts**

```typescript
interface ClientConfig {
  apiUrl: string
  apiKey: string
  model: string
  temperature: number
  requestTimeout: number  // seconds
}

export class OpenAIClient {
  constructor(private readonly config: ClientConfig) {}

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.requestTimeout * 1000
    )

    let response: Response
    try {
      response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey
            ? { Authorization: `Bearer ${this.config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: this.config.temperature,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream: false,
        }),
        signal: controller.signal,
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(`Request timeout after ${this.config.requestTimeout}s`)
      }
      throw err
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      const body = await response.text()
      const error = Object.assign(new Error(`API error ${response.status}: ${body}`), {
        status: response.status,
      })
      throw error
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> }
    return data.choices[0].message.content
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/openai-client.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/background/openai-client.ts tests/openai-client.test.ts
git commit -m "feat: OpenAI-compatible HTTP client with timeout and error codes"
```

---

## Phase 2: Website Translation

### Task 8: Window manager

**Files:**
- Create: `src/background/window-manager.ts`

*(No unit tests — wraps browser.windows API directly, tested manually)*

- [ ] **Step 1: Create src/background/window-manager.ts**

```typescript
export interface SplitResult {
  sourceWindowId: number
  translationWindowId: number
}

export async function openSplitTranslation(
  sourceTabId: number,
  translationUrl: string
): Promise<SplitResult> {
  // Get screen dimensions from the content script context
  const [{ result }] = await browser.scripting.executeScript({
    target: { tabId: sourceTabId },
    func: () => ({ w: window.screen.width, h: window.screen.height }),
  })
  const { w, h } = result as { w: number; h: number }
  const half = Math.floor(w / 2)

  const sourceWindow = await browser.windows.getCurrent()
  await browser.windows.update(sourceWindow.id!, {
    left: 0,
    top: 0,
    width: half,
    height: h,
    state: 'normal',
  })

  const translationWindow = await browser.windows.create({
    url: `${translationUrl}?sourceTabId=${sourceTabId}`,
    left: half,
    top: 0,
    width: w - half,
    height: h,
    type: 'normal',
  })

  return {
    sourceWindowId: sourceWindow.id!,
    translationWindowId: translationWindow.id!,
  }
}

export async function closeSplitIfOpen(windowId: number): Promise<void> {
  try {
    await browser.windows.remove(windowId)
  } catch {
    // window already closed — ignore
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/background/window-manager.ts
git commit -m "feat: split-screen window manager using browser.windows API"
```

---

### Task 9: Context analyzer

**Files:**
- Create: `src/background/context-analyzer.ts`

- [ ] **Step 1: Create src/background/context-analyzer.ts**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/background/context-analyzer.ts
git commit -m "feat: AI context-aware page analyzer"
```

---

### Task 10: Background service worker

**Files:**
- Create: `src/background/worker.ts` (replaces stub from Task 1)

- [ ] **Step 1: Create src/background/worker.ts**

```typescript
import { loadConfig } from '../shared/config'
import { OpenAIClient } from './openai-client'
import { RateLimitedQueue } from './queue'
import { batchBlocks, renderMultiplePrompt, renderSinglePrompt, parseMultipleResponse } from './text-batcher'
import { openSplitTranslation, closeSplitIfOpen } from './window-manager'
import { analyzePageContext } from './context-analyzer'
import { detectLang, langCodeToName, targetLangName } from '../shared/lang-detect'
import type { Message, TranslationBlock } from '../shared/messages'

interface ActiveTranslation {
  translationWindowId: number
  aborted: boolean
}

const active = new Map<number, ActiveTranslation>()

browser.runtime.onMessage.addListener(
  (msg: Message, sender) => {
    if (msg.type === 'START_TRANSLATION') {
      startTranslation(msg.tabId, msg.sourceUrl).catch(console.error)
    }
    if (msg.type === 'STOP_TRANSLATION' && sender.tab?.id) {
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
    const state = active.get(tab.id)!
    state.aborted = true
    await closeSplitIfOpen(state.translationWindowId)
    active.delete(tab.id)
  } else {
    await startTranslation(tab.id, tab.url)
  }
})

async function startTranslation(tabId: number, sourceUrl: string): Promise<void> {
  const config = await loadConfig()
  const client = new OpenAIClient(config)
  const queue = new RateLimitedQueue({ maxRPS: config.maxRPS })

  const translationUrl = browser.runtime.getURL('translation/translation.html')
  const { translationWindowId } = await openSplitTranslation(tabId, translationUrl)

  const state: ActiveTranslation = { translationWindowId, aborted: false }
  active.set(tabId, state)

  // Extract text blocks from the page
  const [{ result: blocks }] = await browser.scripting.executeScript({
    target: { tabId },
    func: () => {
      // extractor is already injected via content script
      return (window as unknown as { __ztExtract: () => Array<{id:string;text:string}> }).__ztExtract()
    },
  })

  const typedBlocks = blocks as Array<{ id: string; text: string }>
  const allText = typedBlocks.map(b => b.text).join(' ')
  const detectedLang = config.sourceLang === 'auto' ? detectLang(allText) : config.sourceLang
  const fromName = langCodeToName(detectedLang)
  const toName = targetLangName()

  // AI context-aware pre-pass
  let contextSuffix = ''
  if (config.aiContextAware) {
    const [{ result: titleResult }] = await browser.scripting.executeScript({
      target: { tabId },
      func: () => document.title,
    })
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
    if (state.aborted) break

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
      }
    } catch (err) {
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
        } catch {
          done++
        }
      }
    }

    const progressMsg: Message = { type: 'TRANSLATION_PROGRESS', done, total: typedBlocks.length }
    await sendToTranslationWindow(translationWindowId, progressMsg)
  }

  if (!state.aborted) {
    await sendToTranslationWindow(translationWindowId, { type: 'TRANSLATION_DONE' })
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
```

- [ ] **Step 2: Rebuild and check for TypeScript errors**

```bash
npx tsc --noEmit
```
Expected: no errors (if there are errors, fix types)

- [ ] **Step 3: Commit**

```bash
git add src/background/worker.ts
git commit -m "feat: background service worker — translation pipeline orchestration"
```

---

### Task 11: Content script

**Files:**
- Create: `src/content/content.ts`

- [ ] **Step 1: Create src/content/content.ts**

```typescript
import { extractTextBlocks } from './extractor'

// Expose extraction function to background worker
;(window as unknown as Record<string, unknown>).__ztExtract = () =>
  extractTextBlocks(document.body).map(b => ({ id: b.id, text: b.text }))

// Listen for scroll sync requests and block translation updates
browser.runtime.onMessage.addListener((msg: { type: string; ratio?: number }) => {
  if (msg.type === 'SCROLL_SYNC' && msg.ratio !== undefined) {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: msg.ratio * maxScroll, behavior: 'smooth' })
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add src/content/
git commit -m "feat: content script — text extraction and scroll sync"
```

---

### Task 12: Translation window

**Files:**
- Create: `src/translation/translation.html`
- Create: `src/translation/translation.ts`

- [ ] **Step 1: Create src/translation/translation.html**

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Zen Translate</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { font-size: 16px; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.7;
      color: #1a1a1a;
      background: #fff;
      padding: 24px 32px;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #1a1a1a; color: #e8e8e8; }
      .block { border-left-color: #3a7bd5; }
    }
    #status {
      position: sticky;
      top: 0;
      background: inherit;
      padding: 8px 0 12px;
      font-size: 13px;
      color: #666;
      border-bottom: 1px solid #eee;
      margin-bottom: 20px;
      z-index: 10;
    }
    .block {
      padding: 8px 12px;
      margin-bottom: 16px;
      border-left: 3px solid transparent;
      border-radius: 2px;
      transition: border-color 0.2s, background 0.2s;
    }
    .block.highlight {
      border-left-color: #3a7bd5;
      background: rgba(58, 123, 213, 0.05);
    }
    .block.loading { color: #999; font-style: italic; }
  </style>
</head>
<body>
  <div id="status">Connecting...</div>
  <div id="content"></div>
  <script type="module" src="translation.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create src/translation/translation.ts**

```typescript
import type { Message, TranslationBlock } from '../shared/messages'

const params = new URLSearchParams(location.search)
const sourceTabId = parseInt(params.get('sourceTabId') ?? '0', 10)

const statusEl = document.getElementById('status')!
const contentEl = document.getElementById('content')!

const blocks = new Map<string, HTMLElement>()
let total = 0
let done = 0

function setStatus(text: string): void {
  statusEl.textContent = text
}

function getOrCreateBlock(id: string): HTMLElement {
  if (blocks.has(id)) return blocks.get(id)!
  const div = document.createElement('div')
  div.className = 'block loading'
  div.dataset.ztId = id
  div.textContent = '...'
  contentEl.appendChild(div)
  blocks.set(id, div)
  return div
}

browser.runtime.onMessage.addListener((msg: Message) => {
  if (msg.type === 'TRANSLATION_BLOCK') {
    const block = msg.block as TranslationBlock
    const el = getOrCreateBlock(block.id)
    el.textContent = block.translatedText ?? block.originalText
    el.classList.remove('loading')
  }

  if (msg.type === 'TRANSLATION_PROGRESS') {
    done = msg.done
    total = msg.total
    setStatus(`Translating... ${done} / ${total}`)
  }

  if (msg.type === 'TRANSLATION_DONE') {
    setStatus(`Translation complete — ${total} paragraphs`)
  }

  if (msg.type === 'TRANSLATION_ERROR') {
    setStatus(`Error: ${msg.message}`)
  }

  if (msg.type === 'SCROLL_SYNC' && msg.ratio !== undefined) {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: msg.ratio * maxScroll, behavior: 'smooth' })

    // Highlight the block closest to current scroll position
    const viewportMid = window.scrollY + window.innerHeight / 2
    let closest: HTMLElement | null = null
    let closestDist = Infinity
    for (const el of blocks.values()) {
      const rect = el.getBoundingClientRect()
      const dist = Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2)
      if (dist < closestDist) { closestDist = dist; closest = el }
    }
    if (closest) {
      for (const el of blocks.values()) el.classList.remove('highlight')
      closest.classList.add('highlight')
    }
  }
})

// Tell the source tab about our scroll too
window.addEventListener('scroll', () => {
  if (!sourceTabId) return
  const ratio = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight || 1)
  browser.tabs.sendMessage(sourceTabId, { type: 'SCROLL_SYNC', ratio }).catch(() => {})
})

setStatus('Waiting for translation...')
```

- [ ] **Step 3: Commit**

```bash
git add src/translation/
git commit -m "feat: translation window — renders blocks, scroll sync, highlight"
```

---

### Task 13: Popup and Settings

**Files:**
- Create: `src/popup/popup.html`
- Create: `src/popup/popup.ts`
- Create: `src/settings/settings.html`
- Create: `src/settings/settings.ts`

- [ ] **Step 1: Create src/popup/popup.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { width: 280px; padding: 16px; font-family: system-ui, sans-serif; font-size: 14px; }
    button {
      display: block; width: 100%; padding: 10px; margin-bottom: 8px;
      border: none; border-radius: 6px; cursor: pointer; font-size: 14px;
      background: #3a7bd5; color: #fff;
    }
    button:hover { background: #2d6abf; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    #progress { font-size: 12px; color: #666; text-align: center; margin-bottom: 8px; }
    select { width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #ddd; margin-bottom: 8px; }
    a { display: block; text-align: center; font-size: 12px; color: #666; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <button id="btn-translate">Translate Page</button>
  <button id="btn-pdf" style="display:none">Translate PDF</button>
  <div id="progress"></div>
  <select id="model-select"></select>
  <a id="settings-link" href="#">Settings</a>
  <script type="module" src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create src/popup/popup.ts**

```typescript
import { loadConfig, saveConfig } from '../shared/config'
import type { Message } from '../shared/messages'

const btnTranslate = document.getElementById('btn-translate') as HTMLButtonElement
const btnPdf = document.getElementById('btn-pdf') as HTMLButtonElement
const progressEl = document.getElementById('progress')!
const modelSelect = document.getElementById('model-select') as HTMLSelectElement
const settingsLink = document.getElementById('settings-link')!

const MODELS = ['llama3.1', 'mistral:7b']

async function init(): Promise<void> {
  const config = await loadConfig()
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })

  // Populate model dropdown
  MODELS.forEach(m => {
    const opt = document.createElement('option')
    opt.value = m
    opt.textContent = m
    opt.selected = m === config.model
    modelSelect.appendChild(opt)
  })

  // Show PDF button if current tab is a PDF
  if (tab.url?.match(/\.pdf($|\?)/i) || tab.url?.startsWith('blob:')) {
    btnPdf.style.display = 'block'
  }
}

btnTranslate.addEventListener('click', async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!tab.id || !tab.url) return
  btnTranslate.disabled = true
  await browser.runtime.sendMessage({
    type: 'START_TRANSLATION',
    tabId: tab.id,
    sourceUrl: tab.url,
  } satisfies Message)
  window.close()
})

btnPdf.addEventListener('click', async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!tab.id || !tab.url) return
  const pdfUrl = browser.runtime.getURL(`pdf/pdf-viewer.html?url=${encodeURIComponent(tab.url)}`)
  await browser.tabs.create({ url: pdfUrl })
  window.close()
})

modelSelect.addEventListener('change', async () => {
  const config = await loadConfig()
  config.model = modelSelect.value
  await saveConfig(config)
})

settingsLink.addEventListener('click', (e) => {
  e.preventDefault()
  browser.runtime.openOptionsPage()
})

browser.runtime.onMessage.addListener((msg: Message) => {
  if (msg.type === 'TRANSLATION_PROGRESS') {
    progressEl.textContent = `${msg.done} / ${msg.total} paragraphs`
  }
  if (msg.type === 'TRANSLATION_DONE') {
    progressEl.textContent = 'Done!'
    btnTranslate.disabled = false
  }
})

init().catch(console.error)
```

- [ ] **Step 3: Create src/settings/settings.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Zen Translate Settings</title>
  <style>
    body { max-width: 700px; margin: 40px auto; padding: 0 20px; font-family: system-ui, sans-serif; font-size: 14px; }
    h1 { font-size: 20px; margin-bottom: 24px; }
    h2 { font-size: 15px; margin: 24px 0 12px; color: #444; border-bottom: 1px solid #eee; padding-bottom: 6px; }
    label { display: block; margin-bottom: 12px; }
    label span { display: block; margin-bottom: 4px; font-weight: 500; }
    input[type="text"], input[type="number"], input[type="password"], textarea, select {
      width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;
    }
    textarea { height: 80px; resize: vertical; font-family: monospace; font-size: 13px; }
    input[type="checkbox"] { margin-right: 8px; }
    button#save {
      margin-top: 24px; padding: 10px 24px; background: #3a7bd5; color: #fff;
      border: none; border-radius: 6px; cursor: pointer; font-size: 14px;
    }
    button#save:hover { background: #2d6abf; }
    #saved-msg { margin-left: 12px; color: green; font-size: 13px; }
    .hint { font-size: 12px; color: #888; margin-top: 3px; }
  </style>
</head>
<body>
  <h1>Zen Translate Settings</h1>

  <h2>Provider</h2>
  <label><span>API URL</span><input type="text" id="apiUrl"></label>
  <label><span>API Key</span><input type="password" id="apiKey" placeholder="Leave empty for Ollama"></label>
  <label><span>Model</span><input type="text" id="model"></label>
  <label><span>Temperature</span><input type="number" id="temperature" min="0" max="2" step="0.05"></label>
  <label><span>Request Timeout (seconds)</span><input type="number" id="requestTimeout" min="10" max="600"></label>
  <label><span>Max Requests Per Second</span><input type="number" id="maxRPS" min="1" max="50"></label>
  <label><span>Max Text Length Per Request (chars)</span><input type="number" id="maxTextLengthPerRequest" min="200" max="8000"></label>
  <label><span>Max Paragraphs Per Request</span><input type="number" id="maxParagraphsPerRequest" min="1" max="50"></label>

  <h2>Prompts</h2>
  <p class="hint">Variables: {{from}}, {{to}}, {{text}}, {{json}}, {{imt_title}}, {{imt_theme}}</p>
  <label><span>System Prompt</span><textarea id="systemPrompt"></textarea></label>
  <label><span>Multiple Prompt (batched)</span><textarea id="multiplePrompt"></textarea></label>
  <label><span>Single Prompt</span><textarea id="singlePrompt"></textarea></label>

  <h2>Features</h2>
  <label>
    <input type="checkbox" id="aiContextAware">
    <span style="display:inline">Enable AI Context-Aware</span>
    <p class="hint">Makes a pre-pass to extract page topic and key terms for more consistent translations.</p>
  </label>

  <h2>Languages</h2>
  <label>
    <span>Source Language</span>
    <select id="sourceLang">
      <option value="auto">Auto-detect</option>
      <option value="en">English</option>
      <option value="zh">Chinese</option>
    </select>
  </label>

  <h2>Hotkey</h2>
  <p>Default: <strong>Alt+A</strong>. Change in <a href="#" id="open-shortcuts">browser extension shortcuts</a>.</p>

  <button id="save">Save Settings</button>
  <span id="saved-msg"></span>

  <script type="module" src="settings.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create src/settings/settings.ts**

```typescript
import { loadConfig, saveConfig, DEFAULT_CONFIG, type ProviderConfig } from '../shared/config'

const fields: Array<keyof ProviderConfig> = [
  'apiUrl', 'apiKey', 'model', 'temperature', 'requestTimeout',
  'maxRPS', 'maxTextLengthPerRequest', 'maxParagraphsPerRequest',
  'systemPrompt', 'multiplePrompt', 'singlePrompt', 'aiContextAware', 'sourceLang',
]

async function init(): Promise<void> {
  const config = await loadConfig()

  for (const key of fields) {
    const el = document.getElementById(key) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
    if (!el) continue
    const val = config[key]
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      el.checked = val as boolean
    } else {
      el.value = String(val)
    }
  }
}

document.getElementById('save')!.addEventListener('click', async () => {
  const base = await loadConfig()
  const updated: ProviderConfig = { ...base }

  for (const key of fields) {
    const el = document.getElementById(key) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
    if (!el) continue
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      (updated as Record<string, unknown>)[key] = el.checked
    } else if (el instanceof HTMLInputElement && el.type === 'number') {
      (updated as Record<string, unknown>)[key] = parseFloat(el.value)
    } else {
      (updated as Record<string, unknown>)[key] = el.value
    }
  }

  await saveConfig(updated)
  const msg = document.getElementById('saved-msg')!
  msg.textContent = 'Saved!'
  setTimeout(() => { msg.textContent = '' }, 2000)
})

document.getElementById('open-shortcuts')!.addEventListener('click', (e) => {
  e.preventDefault()
  browser.tabs.create({ url: 'about:addons' })
})

init().catch(console.error)
```

- [ ] **Step 5: Add options_ui to manifest.json**

Open `manifest.json` and add after the `"commands"` block:
```json
"options_ui": {
  "page": "settings/settings.html",
  "open_in_tab": true
},
```

- [ ] **Step 6: Build and check for errors**

```bash
npx tsc --noEmit && npx vite build
```
Expected: no TypeScript errors, dist/ built successfully.

- [ ] **Step 7: Commit**

```bash
git add src/popup/ src/settings/ manifest.json
git commit -m "feat: popup with translate button and settings page with full config UI"
```

---

### Task 14: Manual test — website translation

**No code changes — verification only.**

- [ ] **Step 1: Install web-ext and load extension in Firefox/Zen**

```bash
npx web-ext run --source-dir dist/ --firefox /usr/bin/firefox
```
(Replace firefox path with Zen if needed: find it with `which zen-browser` or check `/usr/bin/`)

- [ ] **Step 2: Verify Ollama is running**

```bash
curl http://localhost:11434/v1/models
```
Expected: JSON with available models including `llama3.1`

- [ ] **Step 3: Test on an English article**

1. Open any English Wikipedia article
2. Press `Alt+A`
3. Expected: browser window resizes to left half, translation window opens on right
4. Expected: "Translating... 0 / N" appears in translation window
5. Expected: paragraphs appear in Russian as they complete
6. Expected: scrolling the original page syncs the translation window

- [ ] **Step 4: Test stop/toggle**

1. While translating, press `Alt+A` again
2. Expected: translation window closes, source window returns to full size
   *(Note: window auto-resize back is not implemented — close translation window manually for v1)*

- [ ] **Step 5: Test settings**

1. Open popup → Settings
2. Change model to `mistral:7b`, save
3. Translate another page
4. Verify the model in Ollama logs changed

- [ ] **Step 6: Commit any fixes found during manual testing**

---

## Phase 3: PDF Translation

### Task 15: OCR module

**Files:**
- Create: `src/pdf/ocr.ts`

- [ ] **Step 1: Create src/pdf/ocr.ts**

```typescript
import Tesseract from 'tesseract.js'

interface OcrOptions {
  lang: 'eng' | 'chi_sim'
}

export class OcrManager {
  private worker: Tesseract.Worker | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private readonly IDLE_TIMEOUT_MS = 2 * 60 * 1000  // 2 minutes

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      this.terminate()
    }, this.IDLE_TIMEOUT_MS)
  }

  private async getWorker(lang: OcrOptions['lang']): Promise<Tesseract.Worker> {
    if (!this.worker) {
      this.worker = await Tesseract.createWorker(lang)
    }
    this.resetIdleTimer()
    return this.worker
  }

  async recognizePage(imageData: ImageData, opts: OcrOptions): Promise<string> {
    const worker = await this.getWorker(opts.lang)
    const canvas = document.createElement('canvas')
    canvas.width = imageData.width
    canvas.height = imageData.height
    canvas.getContext('2d')!.putImageData(imageData, 0, 0)
    const { data } = await worker.recognize(canvas)
    return data.text
  }

  terminate(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    if (this.worker) {
      this.worker.terminate().catch(() => {})
      this.worker = null
    }
  }
}

export const ocr = new OcrManager()
```

- [ ] **Step 2: Commit**

```bash
git add src/pdf/ocr.ts
git commit -m "feat: Tesseract.js OCR manager with idle termination"
```

---

### Task 16: PDF viewer

**Files:**
- Create: `src/pdf/pdf-viewer.html`
- Create: `src/pdf/pdf-viewer.ts`

- [ ] **Step 1: Create src/pdf/pdf-viewer.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Zen Translate — PDF</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { display: flex; height: 100vh; overflow: hidden; font-family: system-ui, sans-serif; }
    #pdf-panel {
      flex: 1; overflow-y: auto; background: #525659;
      display: flex; flex-direction: column; align-items: center; padding: 20px 0;
    }
    #translation-panel {
      width: 50%; overflow-y: auto; background: #fff; padding: 24px 28px;
      border-left: 1px solid #ddd;
    }
    @media (prefers-color-scheme: dark) {
      #translation-panel { background: #1a1a1a; color: #e8e8e8; border-left-color: #333; }
    }
    canvas { display: block; box-shadow: 0 2px 8px rgba(0,0,0,0.4); margin-bottom: 20px; }
    #status { padding: 12px; font-size: 13px; color: #666; border-bottom: 1px solid #eee; margin-bottom: 16px; }
    .page-translation { margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #eee; }
    .page-label { font-size: 11px; color: #999; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
    .page-text { line-height: 1.7; white-space: pre-wrap; }
    .page-text.loading { color: #bbb; font-style: italic; }
  </style>
</head>
<body>
  <div id="pdf-panel"></div>
  <div id="translation-panel">
    <div id="status">Loading PDF...</div>
    <div id="translations"></div>
  </div>
  <script type="module" src="pdf-viewer.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create src/pdf/pdf-viewer.ts**

```typescript
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
const PAGE_CACHE_MAX = 10

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
      if (el) { el.getContext('2d')!.clearRect(0, 0, el.width, el.height) }
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
  await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
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
    .filter((item): item is pdfjsLib.TextItem => 'str' in item)
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

  const pdf = await pdfjsLib.getDocument(pdfUrl).promise
  const numPages = pdf.numPages
  statusEl.textContent = `${numPages} pages — rendering...`

  // Intersection observer for lazy translation
  const observer = new IntersectionObserver(async (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const pageNum = parseInt((entry.target as HTMLElement).dataset.page ?? '0', 10)
      if (!pageNum || pageCache.get(pageNum)?.text) continue

      const pressure = checkMemory()
      if (pressure !== 'ok') evictCaches(pageNum, pressure)

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
    }
  }, { rootMargin: '200px' })

  // Render all pages (canvas + placeholder translation)
  for (let i = 1; i <= numPages; i++) {
    const pageWrapper = document.createElement('div')
    pageWrapper.dataset.page = String(i)
    pdfPanel.appendChild(pageWrapper)

    const canvas = await renderPage(pdf, i)
    pageWrapper.appendChild(canvas)
    pageCache.set(i, { pageNum: i, canvas, text: '' })

    // Translation placeholder
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

  // Sync scroll between panels
  const translationPanel = document.getElementById('translation-panel')!
  pdfPanel.addEventListener('scroll', () => {
    const ratio = pdfPanel.scrollTop / (pdfPanel.scrollHeight - pdfPanel.clientHeight || 1)
    translationPanel.scrollTop = ratio * (translationPanel.scrollHeight - translationPanel.clientHeight)
  })

  // Memory check every 10s
  setInterval(() => {
    const currentPageEl = [...pdfPanel.querySelectorAll('[data-page]')]
      .find(el => el.getBoundingClientRect().top >= 0) as HTMLElement | undefined
    const currentPage = parseInt(currentPageEl?.dataset.page ?? '1', 10)
    const pressure = checkMemory()
    if (pressure !== 'ok') evictCaches(currentPage, pressure)
  }, 10000)

  statusEl.textContent = `${numPages} pages loaded — scroll to translate`
}

main().catch(err => { statusEl.textContent = `Error: ${err.message}` })
```

- [ ] **Step 3: Build and check**

```bash
npx tsc --noEmit && npx vite build
```
Expected: no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/pdf/
git commit -m "feat: PDF viewer with PDF.js + Tesseract OCR + lazy translation + LRU memory"
```

---

### Task 17: Manual test — PDF translation

- [ ] **Step 1: Test with a text PDF**

1. Open a PDF article in Zen (e.g., drag and drop an academic paper PDF)
2. Click popup → "Translate PDF"
3. Expected: new tab opens with PDF on left, translation panel on right
4. Scroll down — expected: each page translates as it comes into view

- [ ] **Step 2: Test with a scanned PDF**

1. Find a scanned PDF (image-based, no selectable text)
2. Repeat steps above
3. Expected: OCR runs (may be slow), Russian translation appears

- [ ] **Step 3: Test memory pressure**

1. Open a large PDF (50+ pages)
2. Scroll through quickly
3. Open browser devtools → Memory tab
4. Expected: heap usage stays bounded, does not grow linearly with pages

- [ ] **Step 4: Commit any fixes found during testing**

---

## Phase 4: Final integration

### Task 18: Run all tests and fix gaps

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run --coverage
```
Expected: all tests pass

- [ ] **Step 2: Build production bundle**

```bash
npx vite build
```
Expected: no errors, `dist/` ready

- [ ] **Step 3: Package extension**

```bash
npx web-ext build --source-dir dist/
```
Expected: `.zip` file created in `web-ext-artifacts/` ready to load in Zen/Firefox

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete zen-translate extension — website + PDF split-screen translation"
```

---

## Test Coverage Summary

| Module | Test file | What's covered |
|---|---|---|
| `shared/config.ts` | `config.test.ts` | defaults, load/save roundtrip |
| `shared/lang-detect.ts` | `lang-detect.test.ts` | EN/ZH detection, fallback |
| `content/extractor.ts` | `extractor.test.ts` | DOM extraction, skip rules, ID tagging |
| `background/text-batcher.ts` | `text-batcher.test.ts` | batching, prompt rendering, JSON parsing |
| `background/queue.ts` | `queue.test.ts` | rate limiting, retry, backoff |
| `background/openai-client.ts` | `openai-client.test.ts` | request format, response parsing, timeout, HTTP errors |
