import Tesseract from 'tesseract.js'

interface OcrOptions {
  lang: 'eng' | 'chi_sim'
}

export class OcrManager {
  private worker: Tesseract.Worker | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private readonly IDLE_TIMEOUT_MS = 2 * 60 * 1000  // 2 minutes

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      this.terminate()
    }, this.IDLE_TIMEOUT_MS)
  }

  private async getWorker(lang: OcrOptions['lang']): Promise<Tesseract.Worker> {
    if (!this.worker) {
      this.worker = await Tesseract.createWorker(lang)
    }
    this.resetIdleTimer()
    return this.worker
  }

  async recognizePage(imageData: ImageData, opts: OcrOptions): Promise<string> {
    const worker = await this.getWorker(opts.lang)
    const canvas = document.createElement('canvas')
    canvas.width = imageData.width
    canvas.height = imageData.height
    canvas.getContext('2d')!.putImageData(imageData, 0, 0)
    const { data } = await worker.recognize(canvas)
    return data.text
  }

  terminate(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    if (this.worker) {
      this.worker.terminate().catch(() => {})
      this.worker = null
    }
  }
}

export const ocr = new OcrManager()
