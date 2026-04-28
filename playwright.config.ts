import { defineConfig, devices } from '@playwright/test'

/**
 * E2E tests run against the Vite dev server + a running ASP.NET API.
 *
 * Prerequisites:
 *   1. Start the API:  dotnet run --project BMS_POS_API  (uses test DB env vars below)
 *   2. Start Vite:     npm run dev-vite
 *   3. Run tests:      npm run test:e2e
 *
 * Or set E2E_START_SERVERS=true to let Playwright start both automatically
 * (requires dotnet and the test DB to be available).
 *
 * Required env vars for the API's test database:
 *   BMS_DB_USER, BMS_DB_PASSWORD, BMS_DB_SERVER, BMS_DB_PORT, BMS_DB_NAME
 *
 * E2E seed employee (must exist in the DB before running tests):
 *   Employee ID: E2E001  PIN: 1234  Role: Manager
 *   → seed with:  npm run test:e2e:seed
 */

const START_SERVERS = process.env.E2E_START_SERVERS === 'true'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 12_000 },
  retries: process.env.CI ? 2 : 1,
  workers: 1, // serial — tests share a database

  use: {
    baseURL: 'http://localhost:3001',
    headless: process.env.E2E_HEADED !== 'true',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',

    // Mock window.electronAPI — hardware calls don't exist outside Electron
    storageState: undefined,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // When E2E_START_SERVERS=true, Playwright boots both servers automatically
  webServer: START_SERVERS ? [
    {
      command: 'npm run dev-vite',
      url: 'http://localhost:3001',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'dotnet run --project BMS_POS_API --no-build',
      url: 'http://localhost:5002/health/live',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ] : undefined,

  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
})
