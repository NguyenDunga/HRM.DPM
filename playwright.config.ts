import { defineConfig } from "@playwright/test";

/**
 * Playwright config for DPM.
 *
 * These are pure Node unit tests (no browser), so there are no browser
 * `projects` and no `use`/`page` fixtures — we only rely on Playwright's
 * test runner + expect. Run with `npx playwright test` or `npm test`.
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.test\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
});
