import { loadConfig, saveConfig, type ProviderConfig } from '../shared/config'
import { clearAllCache } from '../shared/translation-cache'

import { getLogs, clearLogs, formatLogs } from '../shared/logger'

const fields: Array<keyof ProviderConfig> = [
  'temperature', 'requestTimeout', 'maxRPS',
  'maxTextLengthPerRequest', 'maxParagraphsPerRequest',
  'systemPrompt', 'multiplePrompt', 'singlePrompt',
  'aiContextAware', 'sourceLang', 'scrollSyncEnabled',
]

// Profile UI elements
const profileListEl = document.getElementById('profile-list')!
const profileFormEl = document.getElementById('profile-form')!
const profileIdEl = document.getElementById('profile-id') as HTMLInputElement
const profileNameEl = document.getElementById('profile-name') as HTMLInputElement
const profileApiUrlEl = document.getElementById('profile-apiUrl') as HTMLInputElement
const profileApiKeyEl = document.getElementById('profile-apiKey') as HTMLInputElement
const profileModelEl = document.getElementById('profile-model') as HTMLInputElement

let currentConfig: ProviderConfig

async function init(): Promise<void> {
  currentConfig = await loadConfig()

  for (const key of fields) {
    const el = document.getElementById(key) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
    if (!el) continue
    const val = currentConfig[key]
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      el.checked = val as boolean
    } else {
      el.value = String(val)
    }
  }

  renderProfileList()
  await refreshLogs()
}

function renderProfileList(): void {
  profileListEl.innerHTML = ''
  for (const profile of currentConfig.profiles) {
    const div = document.createElement('div')
    div.className = `profile-item ${profile.id === currentConfig.activeProfileId ? 'active' : ''}`
    div.innerHTML = `
      <div class="profile-name">${profile.name}</div>
      <div class="profile-model">${profile.model}</div>
      <button class="btn-set-active" data-id="${profile.id}" style="background:#3a7bd5;color:#fff">Set Active</button>
      <button class="btn-edit" data-id="${profile.id}" style="background:#555;color:#fff">Edit</button>
      <button class="btn-delete" data-id="${profile.id}" style="background:#c0392b;color:#fff">Delete</button>
    `
    profileListEl.appendChild(div)
  }

  // Attach listeners
  profileListEl.querySelectorAll('.btn-set-active').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id!
      currentConfig.activeProfileId = id
      await saveConfig(currentConfig)
      renderProfileList()
    })
  })

  profileListEl.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id!
      const profile = currentConfig.profiles.find(p => p.id === id)
      if (!profile) return
      profileIdEl.value = profile.id
      profileNameEl.value = profile.name
      profileApiUrlEl.value = profile.apiUrl
      profileApiKeyEl.value = profile.apiKey
      profileModelEl.value = profile.model
      profileFormEl.classList.add('visible')
    })
  })

  profileListEl.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id!
      if (currentConfig.profiles.length <= 1) {
        alert('Cannot delete the last profile.')
        return
      }
      if (!confirm(`Delete profile "${currentConfig.profiles.find(p => p.id === id)?.name}"?`)) return
      currentConfig.profiles = currentConfig.profiles.filter(p => p.id !== id)
      if (currentConfig.activeProfileId === id) {
        currentConfig.activeProfileId = currentConfig.profiles[0].id
      }
      await saveConfig(currentConfig)
      renderProfileList()
    })
  })
}

// Add new profile
document.getElementById('btn-add-profile')!.addEventListener('click', () => {
  profileIdEl.value = ''
  profileNameEl.value = ''
  profileApiUrlEl.value = 'http://localhost:11434/v1/chat/completions'
  profileApiKeyEl.value = ''
  profileModelEl.value = 'llama3.1'
  profileFormEl.classList.add('visible')
})

// Save profile
document.getElementById('btn-save-profile')!.addEventListener('click', async () => {
  const name = profileNameEl.value.trim()
  const apiUrl = profileApiUrlEl.value.trim()
  const apiKey = profileApiKeyEl.value.trim()
  const model = profileModelEl.value.trim()

  if (!name || !apiUrl || !model) {
    alert('Name, API URL, and Model are required.')
    return
  }

  const id = profileIdEl.value || 'profile-' + Date.now()
  const existingIndex = currentConfig.profiles.findIndex(p => p.id === id)

  if (existingIndex >= 0) {
    currentConfig.profiles[existingIndex] = { id, name, apiUrl, apiKey, model }
  } else {
    currentConfig.profiles.push({ id, name, apiUrl, apiKey, model })
    if (!currentConfig.activeProfileId) {
      currentConfig.activeProfileId = id
    }
  }

  await saveConfig(currentConfig)
  profileFormEl.classList.remove('visible')
  renderProfileList()
})

// Cancel profile edit
document.getElementById('btn-cancel-profile')!.addEventListener('click', () => {
  profileFormEl.classList.remove('visible')
})

// Save global settings
document.getElementById('save')!.addEventListener('click', async () => {
  const updated: ProviderConfig = { ...currentConfig }

  for (const key of fields) {
    const el = document.getElementById(key) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
    if (!el) continue
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      (updated as unknown as Record<string, unknown>)[key] = el.checked
    } else if (el instanceof HTMLInputElement && el.type === 'number') {
      const parsed = parseFloat(el.value)
      ;(updated as unknown as Record<string, unknown>)[key] = isNaN(parsed) ? currentConfig[key] : parsed
    } else {
      (updated as unknown as Record<string, unknown>)[key] = el.value
    }
  }

  await saveConfig(updated)
  currentConfig = updated
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
