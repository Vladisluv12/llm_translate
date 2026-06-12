import { createLogger } from '../shared/logger'

const log = createLogger('window-manager')

export interface SplitResult {
  sourceWindowId: number
  translationWindowId: number
}

async function getScreenDims(tabId: number): Promise<{ w: number; h: number }> {
  try {
    const [{ result }] = await browser.scripting.executeScript({
      target: { tabId },
      func: (() => ({ w: window.screen.width, h: window.screen.height })) as unknown as () => void,
    })
    log.debug('screen dims from tab', { tabId, dims: result })
    return result as { w: number; h: number }
  } catch (e) {
    log.warn('getScreenDims failed, using defaults', { error: String(e) })
    return { w: 1920, h: 1080 }
  }
}

async function getSourceWindow(): Promise<{ id: number; width: number; left: number }> {
  try {
    const win = await browser.windows.getCurrent()
    log.debug('getCurrent result', { win })
    if (win?.id && win.type !== 'popup') {
      return { id: win.id, width: win.width ?? 1920, left: win.left ?? 0 }
    }
  } catch (e) {
    log.warn('getSourceWindow failed', { error: String(e) })
  }
  throw new Error('No suitable source window found')
}

export async function openSplitTranslation(
  sourceTabId: number,
  translationUrl: string
): Promise<SplitResult> {
  const { w, h } = await getScreenDims(sourceTabId)
  const half = Math.floor(w / 2)

  log.info('split screen', { screenW: w, screenH: h, half })

  const sourceWindow = await getSourceWindow()
  log.info('source window', { id: sourceWindow.id, width: sourceWindow.width, left: sourceWindow.left })

  await browser.windows.update(sourceWindow.id, {
    left: 0,
    top: 0,
    width: half,
    height: h,
    state: 'normal',
  })
  log.debug('source window updated to left half', { left: 0, width: half })

  const translationWindow = await browser.windows.create({
    url: `${translationUrl}?sourceTabId=${sourceTabId}`,
    left: half,
    top: 0,
    width: w - half,
    height: h,
    type: 'normal',
  })
  log.info('translation window created', { id: translationWindow.id, left: half, width: w - half })

  return {
    sourceWindowId: sourceWindow.id,
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