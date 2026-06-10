const PANEL_ID = 'zt-inline-panel'

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export function showInlinePanel(original: string, translated: string): void {
  let panel = document.getElementById(PANEL_ID)
  if (!panel) {
    panel = document.createElement('div')
    panel.id = PANEL_ID
    panel.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 360px;
      max-height: 280px;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.18);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      line-height: 1.6;
      overflow-y: auto;
      padding: 16px;
      color: #1a1a1a;
    `
    // Dark mode
    const darkMedia = window.matchMedia('(prefers-color-scheme: dark)')
    if (darkMedia.matches) {
      panel.style.background = '#1a1a1a'
      panel.style.color = '#e0e0e0'
      panel.style.borderColor = '#444'
    }
    document.body.appendChild(panel)
  }

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span style="font-weight:600;font-size:13px;color:#3a7bd5;">Zen Translate</span>
      <button id="zt-inline-close" style="background:none;border:none;cursor:pointer;font-size:18px;color:#999;line-height:1;">×</button>
    </div>
    <div style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Original</div>
    <div style="margin-bottom:12px;color:#333;white-space:pre-wrap;">${escapeHtml(original)}</div>
    <div style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Translation</div>
    <div style="color:#1a1a1a;font-weight:500;white-space:pre-wrap;">${escapeHtml(translated)}</div>
  `

  document.getElementById('zt-inline-close')?.addEventListener('click', () => panel?.remove())

  // Auto-close on outside click
  const outsideClick = (e: MouseEvent) => {
    if (!panel?.contains(e.target as Node)) {
      panel?.remove()
      document.removeEventListener('click', outsideClick)
    }
  }
  setTimeout(() => document.addEventListener('click', outsideClick), 0)
}
