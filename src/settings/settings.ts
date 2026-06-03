import { loadConfig, saveConfig, type ProviderConfig } from '../shared/config'

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

init().catch(console.error)
