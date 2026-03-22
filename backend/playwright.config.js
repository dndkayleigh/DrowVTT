import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL: 'http://127.0.0.1:3000',
    headless: true,
    viewport: { width: 1440, height: 1100 }
  },
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:3000/',
    reuseExistingServer: true,
    timeout: 30_000
  }
});
