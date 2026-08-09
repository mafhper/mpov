import { defineConfig, devices } from "@playwright/test";

const testPort = 4323;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: `http://127.0.0.1:${testPort}/mpov/`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node scripts/playwright-server.mjs --host 127.0.0.1 --port ${testPort}`,
    url: `http://127.0.0.1:${testPort}/mpov/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 } },
    },
    {
      name: "tablet",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 900 } },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
  ],
});
