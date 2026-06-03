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

  MODELS.forEach(m => {
    const opt = document.createElement('option')
    opt.value = m
    opt.textContent = m
    opt.selected = m === config.model
    modelSelect.appendChild(opt)
  })

  if (tab.url?.match(/\.pdf($|\?)/i) || tab.url?.startsWith('blob:')) {
    btnPdf.style.display = 'block'
  }
}

btnTranslate.addEventListener('click', async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url) return
  btnTranslate.disabled = true
  progressEl.textContent = 'Starting...'
  const msg: Message = { type: 'START_TRANSLATION', tabId: tab.id, sourceUrl: tab.url }
  await browser.runtime.sendMessage(msg)
  window.close()
})

btnPdf.addEventListener('click', async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url) return
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
