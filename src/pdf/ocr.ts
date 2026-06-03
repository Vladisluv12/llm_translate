import Tesseract from 'tesseract.js'

interface OcrOptions {
  lang: 'eng' | 'chi_sim'
}

export class OcrManager {
  private worker: Tesseract.Worker | null = null
  private workerLang: string | null = null
  private recognizeQueue: Promise<string> = Promise.resolve('')
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private readonly IDLE_TIMEOUT_MS = 2 * 60 * 1000  // 2 minutes

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => { this.terminate() }, this.IDLE_TIMEOUT_MS)
  }

  private async getWorker(lang: string): Promise<Tesseract.Worker> {
    // Reinit if language changed
    if (this.worker && this.workerLang !== lang) {
      this.terminate()
    }
    if (!this.worker) {
      this.worker = await Tesseract.createWorker(lang)
      this.workerLang = lang
    }
    this.resetIdleTimer()
    return this.worker
  }

  async recognizePage(imageData: ImageData, opts: OcrOptions): Promise<string> {
    // Chain onto the existing queue to serialize calls
    this.recognizeQueue = this.recognizeQueue.then(() => this._doRecognize(imageData, opts))
    return this.recognizeQueue
  }

  private async _doRecognize(imageData: ImageData, opts: OcrOptions): Promise<string> {
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
      this.workerLang = null
    }
  }
}

export const ocr = new OcrManager()
