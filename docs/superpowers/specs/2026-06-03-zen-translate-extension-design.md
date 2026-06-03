# Zen Translate Extension — Design Spec

**Date:** 2026-06-03  
**Status:** Approved

---

## Overview

A Firefox/Zen browser extension that translates websites and PDFs (EN/ZH → RU) in split-screen mode. The split is achieved by resizing the current window to the left half of the screen and opening a translation window on the right half — using standard `browser.windows` WebExtension API, since Zen's native split has no public API.

Translation is powered by a local OpenAI-compatible API (Ollama by default), with full configurability to support other providers (NVIDIA API, OpenAI, etc.).

---

## Architecture

### File Structure

```
manifest.json
background/
  worker.js           — service worker: Ollama client, message routing, queue
content/
  extractor.js        — extracts text blocks from page DOM
  scroll-sync.js      — postMessage scroll sync with translation window
sidebar/
  translation.html    — right-side translation window
  translation.js
pdf/
  pdf-viewer.html     — PDF.js renderer + Tesseract OCR + translation
  pdf-viewer.js
popup/
  popup.html          — toolbar button UI
  popup.js
settings/
  settings.html
  settings.js
```

### Browser Target

Firefox Manifest V3. Works in Zen browser (Firefox fork). No Zen-specific APIs used.

---

## Split-Screen Implementation

When translation is triggered, the background worker:

1. Gets the current window via `browser.windows.getCurrent()`
2. Resizes it to the left half of the screen:
   ```js
   browser.windows.update(win.id, {
     left: 0, top: 0,
     width: screen.width / 2,
     height: screen.height
   })
   ```
3. Opens `translation.html` in a new window on the right half:
   ```js
   browser.windows.create({
     url: browser.runtime.getURL('translation/translation.html'),
     left: screen.width / 2, top: 0,
     width: screen.width / 2,
     height: screen.height
   })
   ```
4. Passes the source tab ID to the translation window via URL params
5. Scroll sync: content script sends `{ type: 'scroll', ratio: 0.42 }` via `runtime.sendMessage` → translation window scrolls to the same ratio

For PDF: same split, but left window shows `pdf-viewer.html` (not the original tab).

---

## AI Integration

### API

OpenAI-compatible endpoint. Default: `http://localhost:11434/v1/chat/completions` (Ollama).  
Supports any OpenAI-compatible provider (NVIDIA API, OpenAI, DeepSeek, etc.) by changing the URL and API key.

### Settings Schema

```ts
interface ProviderConfig {
  apiUrl: string;                       // Default: "http://localhost:11434/v1/chat/completions"
  apiKey: string;                       // Empty for Ollama, required for cloud providers
  model: string;                        // Default: "llama3.1"
  temperature: number;                  // Default: 0.1
  requestTimeout: number;               // Seconds. Default: 120 (for slow local inference)
  maxRPS: number;                       // Max requests per second. Default: 5
  maxTextLengthPerRequest: number;      // Characters. Default: 1800
  maxParagraphsPerRequest: number;      // Paragraphs per batch. Default: 10
  systemPrompt: string;
  multiplePrompt: string;               // Template for batched YAML requests
  singlePrompt: string;                 // Template for single paragraph
  aiContextAware: boolean;              // Default: false
}
```

### Default Prompts

**System Prompt:**
```
You are a professional translator. Translate accurately, preserving tone and formatting. Output only the translation.
```

**Multiple Prompt (batched YAML):**
```
Translate the following paragraphs from {{from}} to {{to}}. Return the same YAML structure with translations in the "text" field.

<yaml>
{{yaml}}
</yaml>
```

**Single Prompt:**
```
Translate the following text from {{from}} to {{to}}:

{{text}}
```

### Template Variables

| Variable | Description |
|---|---|
| `{{to}}` | Target language (e.g. "Russian") |
| `{{from}}` | Source language (e.g. "English") |
| `{{text}}` | Single paragraph text |
| `{{yaml}}` | Batched paragraphs in YAML format |
| `{{imt_title}}` | Page title |
| `{{imt_theme}}` | Page summary (when AI Context-Aware enabled) |
| `{{imt_terms}}` | Key terms extracted from page (when AI Context-Aware enabled) |

### Batching (YAML Format)

Multiple paragraphs are batched into one request:

```yaml
- id: "0"
  text: "First paragraph..."
- id: "1"
  text: "Second paragraph..."
```

The model returns the same YAML with translated text. Results are matched back to DOM elements by `id`.

### Queue & Retry Logic

- Token bucket rate limiter enforcing `maxRPS`
- HTTP 429 → exponential backoff (1s, 2s, 4s, max 30s)
- If batch request fails → retry each paragraph individually
- Request aborted after `requestTimeout` seconds
- Requests beyond rate limit are queued (not dropped)

### AI Context-Aware Mode

When enabled:
1. Before starting translation, sends one request to analyze page title + first 500 words
2. Model returns: `{ theme: "...", terms: { "word": "перевод", ... } }`
3. `{{imt_theme}}` and `{{imt_terms}}` are injected into all subsequent translation prompts
4. Improves consistency for technical/academic content

---

## Text Extraction (Websites)

Content script selects: `p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, figcaption`

Each element gets a `data-zt-id` attribute (e.g. `data-zt-id="42"`). The translation window renders blocks with matching IDs so scroll sync can highlight the corresponding paragraph.

Skipped elements: `code`, `pre`, `script`, `style`, elements with `lang` attribute matching target language.

Language detection: `langdetect` on first 300 chars of page → sets `{{from}}`. Falls back to "English" if uncertain.

---

## PDF Support

### Viewer Page (`pdf-viewer.html`)

Left panel: PDF.js renders the original PDF (canvas-based).  
Right panel: translated text blocks per page.

### Text Extraction Strategy

For each page:
1. Attempt PDF.js text layer extraction
2. If text layer yields < 10 characters → page is scanned → run Tesseract.js OCR
3. Language detection per page for correct Tesseract dictionary (eng or chi_sim)

### Lazy Loading

Translation is page-by-page as the user scrolls. Only the current page ±2 pages are pre-translated. This avoids translating a 200-page document upfront.

### Dynamic Memory Management

- Monitor `performance.memory.jsHeapSizeUsed` every 10 seconds
- Keep LRU cache of last 10 rendered page canvases
- If heap > 80% of `jsHeapSizeLimit`: evict canvas for pages outside viewport (keep text only)
- If heap > 90%: evict all but current page ±2
- Tesseract.js worker is terminated after 2 minutes of idle (frees ~50-100MB), recreated on next OCR request
- Thresholds (80%/90%) configurable in extension's `config.json` (developer option, not in UI)

---

## UI Components

### Popup

- **"Translate Page"** button → triggers split + translation for current tab
- **"Translate PDF"** button → visible only when current tab is a PDF
- Progress indicator: "Translating... 12 / 47 paragraphs"
- Model dropdown (quick switch between configured models)
- Link to Settings

### Settings Page

Sections:
1. **Provider** — API URL, API Key, Model, Temperature, Request Timeout, Max RPS, Max text length, Max paragraphs per request
2. **Prompts** — System Prompt, Multiple Prompt, Single Prompt (with variable reference)
3. **AI Context-Aware** — toggle on/off
4. **Languages** — Source (Auto / English / Chinese), Target (Russian, fixed)
5. **Hotkey** — display only (configured via `browser.commands` in manifest, user can override in `about:addons`)

### Hotkey

`Alt+A` (default) — toggles translation for current page.  
Configured via `commands` in `manifest.json`, overridable by user in browser's extension settings.

---

## Translation Window (`translation.html`)

- Receives source tab ID on load via URL param (`?sourceTabId=42`)
- Background worker streams translated blocks via `runtime.sendMessage`
- Blocks appear as they finish translating (we stream the full HTTP response but only render a block once its complete YAML entry is parsed — partial YAML would break deserialization)
- Each block is a `<div data-zt-id="...">` matching the source
- On scroll event from content script: window scrolls to matching `data-zt-id` element
- Minimal UI: clean white background, same font size as typical article, dark mode follows system preference

---

## Language Support

- Source: English, Chinese (Simplified), Auto-detect
- Target: Russian (fixed, not configurable in this version)
- Tesseract dictionaries: `eng`, `chi_sim` (loaded on demand)

---

## Not In Scope (v1)

- Subtitle translation
- ePub support
- Multiple target languages
- Cloud sync of settings
- Zen native split API (no public API exists as of 2026-06-03)
