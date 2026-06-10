import { loadConfig, saveConfig, type ProviderConfig } from '../shared/config'
import { clearAllCache } from '../shared/translation-cache'

import { getLogs, clearLogs, formatLogs } from '../shared/logger'

const fields: Array<keyof ProviderConfig> = [
  'scrollSyncEnabled',
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

  await refreshLogs()
}

document.getElementById('save')!.addEventListener('click', async () => {
  const base = await loadConfig()
  const updated: ProviderConfig = { ...base }

  for (const key of fields) {
    const el = document.getElementById(key) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
    if (!el) continue
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      (updated as unknown as Record<string, unknown>)[key] = el.checked
    } else if (el instanceof HTMLInputElement && el.type === 'number') {
      const parsed = parseFloat(el.value)
      ;(updated as unknown as Record<string, unknown>)[key] = isNaN(parsed) ? base[key] : parsed
    } else {
      (updated as unknown as Record<string, unknown>)[key] = el.value
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

const btnClearAllCache = document.getElementById('btn-clear-all-cache') as HTMLButtonElement
const clearAllStatus = document.getElementById('clear-all-status') as HTMLSpanElement

btnClearAllCache.addEventListener('click', async () => {
  try {
    await clearAllCache()
    clearAllStatus.textContent = 'All translations cleared ✓'
  } catch {
    clearAllStatus.textContent = 'Error clearing cache'
  }
  setTimeout(() => { clearAllStatus.textContent = '' }, 2000)
})

const btnCopyLogs = document.getElementById('btn-copy-logs') as HTMLButtonElement
const btnClearLogs = document.getElementById('btn-clear-logs') as HTMLButtonElement
const logsStatus = document.getElementById('logs-status') as HTMLElement
const logsOutput = document.getElementById('logs-output') as HTMLTextAreaElement

async function refreshLogs(): Promise<void> {
  const entries = await getLogs()
  logsOutput.value = entries.length > 0 ? formatLogs(entries) : '(no logs yet)'
  logsOutput.scrollTop = logsOutput.scrollHeight
}

btnCopyLogs.addEventListener('click', async () => {
  const entries = await getLogs()
  const text = entries.length > 0 ? formatLogs(entries) : '(no logs)'
  await navigator.clipboard.writeText(text)
  logsStatus.textContent = `Copied ${entries.length} entries`
  setTimeout(() => { logsStatus.textContent = '' }, 2000)
})

btnClearLogs.addEventListener('click', async () => {
  await clearLogs()
  logsOutput.value = ''
  logsStatus.textContent = 'Logs cleared'
  setTimeout(() => { logsStatus.textContent = '' }, 2000)
})

init().catch(console.error)
