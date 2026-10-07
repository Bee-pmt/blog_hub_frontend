import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://localhost:3001",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tests/e2e/mock-api.mjs",
      url: "http://localhost:5301/api/v1/categories",
      reuseExistingServer: false,
    },
    {
      command: "npm run build -- --webpack && npm run start -- --port 3001",
      url: "http://localhost:3001",
      env: {
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:5301/api/v1",
        BLOGHUB_TEST_BUILD: "1",
      },
      reuseExistingServer: false,
      timeout: 180000,
    },
  ],
});
