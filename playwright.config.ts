import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://127.0.0.1:8787',
    screenshot: 'on',
  },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: 'npx wrangler dev --port 8787',
    url: 'http://127.0.0.1:8787',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
