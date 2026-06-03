import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/ux',
  timeout: 15000,
  use: {
    baseURL: 'http://localhost:7654',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      executablePath: '/home/vladozz/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
    },
  },
  webServer: {
    command: 'npx http-server dist/ -p 7654 -c-1 --silent',
    url: 'http://localhost:7654',
    reuseExistingServer: false,
  },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
})
