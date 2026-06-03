import { defineConfig } from 'vite'
import { resolve } from 'path'
import { copyFileSync, mkdirSync } from 'fs'

// Plugin to copy PDF.js worker into dist/chunks/ after build
const copyPdfjsWorker = {
  name: 'copy-pdfjs-worker',
  closeBundle() {
    mkdirSync('dist/chunks', { recursive: true })
    copyFileSync(
      resolve(__dirname, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
      resolve(__dirname, 'dist/chunks/pdf.worker.js')
    )
  },
}

export default defineConfig({
  root: 'src',
  plugins: [copyPdfjsWorker],
  build: {
    rollupOptions: {
      input: {
        'background/worker': resolve(__dirname, 'src/background/worker.ts'),
        'content/content': resolve(__dirname, 'src/content/content.ts'),
        translation: resolve(__dirname, 'src/translation/translation.html'),
        popup: resolve(__dirname, 'src/popup/popup.html'),
        settings: resolve(__dirname, 'src/settings/settings.html'),
        'pdf-viewer': resolve(__dirname, 'src/pdf/pdf-viewer.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    target: 'firefox115',
    outDir: '../dist',
    emptyOutDir: true,
    minify: false,
  },
})
