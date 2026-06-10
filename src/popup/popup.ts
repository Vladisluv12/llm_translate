import { loadConfig, saveConfig } from '../shared/config'
import { clearPageCache } from '../shared/translation-cache'
import type { Message } from '../shared/messages'

const btnTranslate = document.getElementById('btn-translate') as HTMLButtonElement
const btnPdf = document.getElementById('btn-pdf') as HTMLButtonElement
const btnClearCache = document.getElementById('btn-clear-cache') as HTMLButtonElement
const progressEl = document.getElementById('progress')!
const profileSelect = document.getElementById('profile-select') as HTMLSelectElement
const settingsLink = document.getElementById('settings-link')!

import { createLogger } from '../shared/logger'

const log = createLogger('popup')

async function init(): Promise<void> {
  const config = await loadConfig()
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })

  profileSelect.innerHTML = ''
  for (const profile of config.profiles) {
    const opt = document.createElement('option')
    opt.value = profile.id
    opt.textContent = profile.name
    opt.selected = profile.id === config.activeProfileId
    profileSelect.appendChild(opt)
  }

  if (tab.url?.match(/\.pdf($|\?)/i) || tab.url?.startsWith('blob:')) {
    btnPdf.style.display = 'block'
  }
}

btnTranslate.addEventListener('click', async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url) return
  log.info('translate clicked', { tabId: tab.id, url: tab.url })
  btnTranslate.disabled = true
  progressEl.textContent = 'Starting...'
  const msg: Message = { type: 'START_TRANSLATION', tabId: tab.id, sourceUrl: tab.url }
  await browser.runtime.sendMessage(msg)
  window.close()
})

btnPdf.addEventListener('click', async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url) return
  log.info('PDF translate clicked', { tabId: tab.id, url: tab.url })
  const pdfUrl = browser.runtime.getURL(`pdf/pdf-viewer.html?url=${encodeURIComponent(tab.url)}`)
  await browser.tabs.create({ url: pdfUrl })
  window.close()
})

btnClearCache.addEventListener('click', async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url) {
    btnClearCache.textContent = 'No URL'
    setTimeout(() => { btnClearCache.textContent = 'Clear page cache' }, 1500)
    return
  }
  try {
    await clearPageCache(tab.url)
    btnClearCache.textContent = 'Cleared ✓'
  } catch {
    btnClearCache.textContent = 'Error'
  }
  setTimeout(() => { btnClearCache.textContent = 'Clear page cache' }, 1500)
})

profileSelect.addEventListener('change', async () => {
  const config = await loadConfig()
  config.activeProfileId = profileSelect.value
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
