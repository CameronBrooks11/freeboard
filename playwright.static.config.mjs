import { defineConfig } from "@playwright/test";

// Local-first (Lite) E2E: drive the FREEBOARD_STATIC build with NO server
// (no api/gateway/Postgres). Playwright's own webServer serves the prebuilt
// static dist via `vite preview`; the build must already exist (the
// `test:e2e:static` script builds it first).
const PORT = Number(process.env.STATIC_E2E_PORT || 4179);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e-static",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-static" }]],
  outputDir: "test-results-static",
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `npm run preview --workspace=packages/ui -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
