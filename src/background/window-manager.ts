export interface SplitResult {
  sourceWindowId: number
  translationWindowId: number
}

export async function openSplitTranslation(
  sourceTabId: number,
  translationUrl: string
): Promise<SplitResult> {
  let w = 1920
  let h = 1080

  try {
    const [{ result }] = await browser.scripting.executeScript({
      target: { tabId: sourceTabId },
      func: (() => {
        return { w: window.screen?.width || 1920, h: window.screen?.height || 1080 }
      }) as unknown as () => void,
    })
    if (result && typeof result.w === 'number' && typeof result.h === 'number') {
      w = result.w
      h = result.h
    }
  } catch (e) {
    console.warn('Failed to get screen dimensions, using defaults', e)
  }

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
