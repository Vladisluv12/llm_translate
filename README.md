# zen-translate

> Split-screen translation for websites and PDFs, powered by local AI (Ollama).

A Firefox/Zen browser extension that translates English and Chinese content into Russian using a locally running language model. The original page stays on the left; the translation appears in a separate window on the right. No cloud APIs required.

---

## Features

- **Split-screen display** — resizes the current window and opens a translation window alongside it via `browser.windows` API (works in any Firefox-based browser; Zen's native split has no public extension API)
- **Website translation** — extracts paragraph-level text blocks from the page DOM, translates in batches, renders results as they arrive
- **PDF translation** — renders PDFs with PDF.js; extracts text from the text layer, falls back to Tesseract.js OCR for scanned pages
- **Lazy PDF loading** — translates only the pages currently visible; memory pressure eviction frees canvas backing stores when RAM usage exceeds configurable thresholds
- **OpenAI-compatible API** — works with Ollama out of the box; swap the endpoint to use any OpenAI-compatible provider (NVIDIA NIM, Together AI, OpenRouter, etc.)
- **Prompt customization** — full control over system prompt, batch prompt, and single-paragraph prompt with template variables
- **AI Context-Aware mode** — optional pre-pass that asks the model to extract the page topic and key terms before translating, improving terminology consistency
- **Rate limiting and retry** — token-bucket rate limiter with exponential backoff on 429 responses; batch failures automatically fall back to per-paragraph requests
- **Hotkey** — `Alt+A` toggles translation on the active tab (configurable in browser extension shortcuts)
- **Language detection** — auto-detects English vs. Chinese source language using franc; Tesseract selects the matching OCR dictionary (`eng` / `chi_sim`)

---

## Demo

![Demo placeholder](docs/demo.gif)

*Replace with an actual screenshot or screen recording.*

---

## Installation

### Prerequisites

- [Zen browser](https://zen-browser.app/) or any Firefox 115+ based browser
- [Ollama](https://ollama.com/) running locally with at least one model pulled:
  ```bash
  ollama pull llama3.1
  # or
  ollama pull mistral:7b
  ```

### Load the extension

```bash
# 1. Clone and install dependencies
git clone https://github.com/Vladisluv12/llm_translate.git
cd llm_translate
npm install

# 2. Build the extension
npm run build

# 3. Load in browser
# Go to about:debugging → This Firefox → Load Temporary Add-on
# Select: dist/manifest.json
```

To package a distributable zip:
```bash
npx web-ext build --source-dir dist/ --artifacts-dir web-ext-artifacts/
```

---

## Usage

1. Open any English or Chinese webpage
2. Press `Alt+A` (or click the toolbar button → **Translate Page**)
3. The browser window splits: original page on the left, Russian translation on the right
4. Scrolling either panel syncs the other

**For PDFs:**
1. Open a PDF in the browser
2. Click the toolbar button → **Translate PDF**
3. A new tab opens with PDF on the left, translation on the right
4. Translation loads page-by-page as you scroll

---

## Configuration

Open the Settings page from the toolbar popup or via `about:addons` → Zen Translate → Preferences.

### Provider

| Setting | Type | Default | Description |
|---|---|---|---|
| API URL | string | `http://localhost:11434/v1/chat/completions` | Any OpenAI-compatible endpoint |
| API Key | string | *(empty)* | Required for cloud providers; leave empty for Ollama |
| Model | string | `llama3.1` | Model name as reported by the provider |
| Temperature | number | `0.1` | Lower = more deterministic translations |
| Request Timeout | seconds | `120` | Increase for slow local inference |
| Max Requests/sec | number | `5` | Rate limit toward the API |
| Max Text Length | chars | `1800` | Maximum characters per API request |
| Max Paragraphs | number | `10` | Maximum paragraphs batched into one request |

### Prompts

Template variables available in all prompts:

| Variable | Value |
|---|---|
| `{{from}}` | Detected source language name (e.g. `English`) |
| `{{to}}` | Target language name (`Russian`) |
| `{{text}}` | Single paragraph text |
| `{{json}}` | JSON array of paragraphs for batch requests |
| `{{imt_title}}` | Page title |
| `{{imt_theme}}` | Page topic extracted by AI Context-Aware pre-pass |

### Features

| Setting | Default | Description |
|---|---|---|
| AI Context-Aware | off | Pre-pass to extract page topic and terminology |
| Source Language | Auto | Force `English` or `Chinese` to skip detection |

---

## Architecture

The extension follows standard Firefox WebExtension patterns with a clear boundary between background logic and UI components.

```
manifest.json
src/
  background/
    worker.ts          ← orchestrates the full translation pipeline
    openai-client.ts   ← OpenAI-compatible HTTP client (timeout, error codes)
    queue.ts           ← token-bucket rate limiter + exponential backoff retry
    text-batcher.ts    ← groups paragraphs into API requests; parses JSON responses
    window-manager.ts  ← split-screen via browser.windows resize
    context-analyzer.ts← AI pre-pass for page topic and key terms
  content/
    content.ts         ← injected into every page; exposes __ztExtract, syncs scroll
    extractor.ts       ← pure DOM → TextBlock[] extraction
  translation/
    translation.html/ts← right-panel window; renders blocks as they arrive
  pdf/
    pdf-viewer.html/ts ← PDF.js renderer + lazy translation + scroll sync
    ocr.ts             ← Tesseract.js wrapper; serializes concurrent OCR calls
  shared/
    config.ts          ← ProviderConfig schema; browser.storage read/write
    messages.ts        ← discriminated union for all inter-component messages
    lang-detect.ts     ← franc-min wrapper; maps ISO codes to 'en' | 'zh'
  popup/  settings/    ← toolbar UI and settings form
```

**Key patterns:**

- **Message passing** — all communication between content scripts, background worker, and translation window goes through typed `runtime.sendMessage` / `tabs.sendMessage`. The `Message` discriminated union in `messages.ts` is the single source of truth for the message bus.
- **Token bucket + chain-of-responsibility fallback** — `RateLimitedQueue` enforces requests-per-second with a refillable token bucket. If a batch translation request fails, the worker falls back to translating each paragraph individually before giving up.
- **Observer-driven lazy loading (PDF)** — `IntersectionObserver` with a 200 px root margin triggers translation only when a PDF page enters the viewport. A `pagesInProgress` sentinel prevents duplicate translation if the same page triggers the observer twice.
- **LRU memory pressure (PDF)** — `performance.memory` is polled every 10 s; canvas backing stores are released (`width = height = 0`) for pages further than 5 (warn) or 2 (critical) pages from the current viewport. The Tesseract worker is terminated under critical pressure and re-created on demand.
- **Serial OCR queue** — `OcrManager.recognizePage` chains calls onto a `Promise` queue so Tesseract's single-threaded worker never receives concurrent `recognize()` calls. The worker reinitializes automatically when the required language changes between pages.

---

## License

MIT — see [LICENSE](LICENSE)
