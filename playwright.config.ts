import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  retries: process.env.CI ? 2 : 1,
  // Every test drives a real request to Wikipedia, so the suite runs one at a
  // time; concurrent runs make the upstream throttle and the run flake.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
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
