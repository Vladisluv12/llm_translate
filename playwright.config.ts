import { defineConfig } from '@playwright/test'

// Screen: 1920x1080 @ 96 DPI, scale 1
// Split-screen: each half = 960x1080 (window-manager.ts splits exactly at screen.width/2)
const SPLIT_WIDTH = 960
const SPLIT_HEIGHT = 1080

export default defineConfig({
  testDir: './tests/ux',
  timeout: 15000,
  use: {
    baseURL: 'http://localhost:7654',
    browserName: 'firefox',
    headless: true,
    // Match actual split-screen window dimensions on the user's 1920x1080 display
    viewport: { width: SPLIT_WIDTH, height: SPLIT_HEIGHT },
  },
  webServer: {
    command: 'npx http-server dist/ -p 7654 -c-1 --silent',
    url: 'http://localhost:7654',
    reuseExistingServer: false,
  },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
})
