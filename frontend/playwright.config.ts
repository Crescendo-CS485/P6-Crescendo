import { defineConfig, devices } from "@playwright/test";

/**
 * Set BASE_URL to run against different environments:
 *   LOCAL (default): http://localhost:5173  (Vite dev server + Flask on :5001)
 *   DEPLOYED:        https://main.d291kg32gzfrfc.amplifyapp.com
 */
const BASE_URL = process.env.BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "../tests/integration",
  timeout: 30_000,
  retries: 0,
  workers: 1, // serial — tests share DB state
  reporter: "list",

  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
