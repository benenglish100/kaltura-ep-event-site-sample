import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4010', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node test/e2e/serve.js',
    url: 'http://127.0.0.1:4010/healthz',
    reuseExistingServer: false,
  },
});
