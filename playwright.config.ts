import { defineConfig, devices } from '@playwright/test'

/**
 * E2E runs against the dev server so tests can import application modules
 * directly (`/src/lib/...`) and exercise real decoding without a model
 * download. The transcription test, which does download a model, is opt-in.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: process.env.E2E_MODEL ? 20 * 60 * 1000 : 60 * 1000,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:4319',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev -- --port 4319',
    url: 'http://localhost:4319',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
})
