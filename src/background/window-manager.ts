export interface SplitResult {
  sourceWindowId: number
  translationWindowId: number
}

export async function openSplitTranslation(
  sourceTabId: number,
  translationUrl: string
): Promise<SplitResult> {
  // Get screen dimensions from the content script context
  const [{ result }] = await browser.scripting.executeScript({
    target: { tabId: sourceTabId },
    func: (() => ({ w: window.screen.width, h: window.screen.height })) as unknown as () => void,
  })
  const { w, h } = result as { w: number; h: number }
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
