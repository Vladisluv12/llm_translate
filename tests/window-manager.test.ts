import { describe, it, expect, vi, beforeEach } from 'vitest'
import { openSplitTranslation, closeSplitIfOpen } from '../src/background/window-manager'

const logMock = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
vi.mock('../shared/logger', () => ({
  createLogger: () => logMock,
}))

beforeEach(() => {
  logMock.debug.mockClear()
  logMock.info.mockClear()
  logMock.warn.mockClear()

  globalThis.browser = {
    tabs: {
      get: vi.fn().mockImplementation((id: number) =>
        Promise.resolve({ id, windowId: 1 })
      ),
    },
    windows: {
      getCurrent: vi.fn().mockResolvedValue({ id: 1, type: 'normal', left: 100, top: 50, width: 1200, height: 800 }),
      get: vi.fn().mockImplementation((id: number) =>
        Promise.resolve({ id, left: 0, top: 0, width: 1920, height: 1080 })
      ),
      update: vi.fn().mockResolvedValue({ id: 1 }),
      create: vi.fn().mockImplementation((info: any) => {
        return Promise.resolve({ id: 2, ...info })
      }),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    scripting: {
      executeScript: vi.fn().mockResolvedValue([
        { result: { w: 1920, h: 1080 }, frameId: 0 },
      ]),
    },
  } as any
})

describe('openSplitTranslation', () => {
  it('splits 1920x1080 screen: source left half, translation right half', async () => {
    const result = await openSplitTranslation(42, '/translation/translation.html')

    expect(browser.windows.update).toHaveBeenCalledWith(1, {
      left: 0,
      top: 0,
      width: 960,
      height: 1080,
      state: 'normal',
    })

    expect(browser.windows.create).toHaveBeenCalledWith({
      url: '/translation/translation.html?sourceTabId=42',
      left: 960,
      top: 0,
      width: 960,
      height: 1080,
      type: 'normal',
    })

    expect(result.sourceWindowId).toBe(1)
    expect(result.translationWindowId).toBe(2)
  })

  

  it('handles odd screen widths by flooring half', async () => {
    ;(browser.scripting.executeScript as any).mockResolvedValue([
      { result: { w: 1921, h: 1080 }, frameId: 0 },
    ])

    await openSplitTranslation(42, '/t.html')

    expect(browser.windows.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ left: 0, width: 960 })
    )
    expect(browser.windows.create).toHaveBeenCalledWith(
      expect.objectContaining({ left: 960, width: 961 })
    )
  })

  it('uses defaults when scripting.executeScript fails', async () => {
    ;(browser.scripting.executeScript as any).mockRejectedValue(new Error('no tab'))

    await openSplitTranslation(42, '/t.html')

    expect(browser.windows.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ left: 0, width: 960, height: 1080 })
    )
    expect(browser.windows.create).toHaveBeenCalledWith(
      expect.objectContaining({ left: 960, width: 960, height: 1080 })
    )
  })

  it('resolves screen dimensions for different screen sizes', async () => {
    ;(browser.scripting.executeScript as any).mockResolvedValue([
      { result: { w: 2560, h: 1440 }, frameId: 0 },
    ])

    await openSplitTranslation(42, '/t.html')

    expect(browser.windows.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ left: 0, width: 1280, height: 1440 })
    )
    expect(browser.windows.create).toHaveBeenCalledWith(
      expect.objectContaining({ left: 1280, width: 1280, height: 1440 })
    )
  })
})

describe('closeSplitIfOpen', () => {
  it('closes the translation window', async () => {
    await closeSplitIfOpen(2)
    expect(browser.windows.remove).toHaveBeenCalledWith(2)
  })

  it('handles already-closed window gracefully', async () => {
    ;(browser.windows.remove as any).mockRejectedValue(new Error('already closed'))
    await expect(closeSplitIfOpen(999)).resolves.toBeUndefined()
  })
})