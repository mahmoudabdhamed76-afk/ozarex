import { defineConfig } from '@playwright/test';

/* Browser smoke tests: every page on a desktop screen and at iPhone width.
   Each worker starts its own copy of the real server (see browser/fixtures.mjs). */
export default defineConfig({
  testDir: './browser',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [['list'], ['json', { outputFile: 'test-results/browser-results.json' }]],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'ar-EG', timezoneId: 'Africa/Cairo' },
  projects: [
    { name: 'desktop', testIgnore: /large\.spec/, use: { viewport: { width: 1366, height: 860 } } },
    { name: 'iphone', use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }, testIgnore: /large\.spec/ },
    { name: 'large-dataset', testMatch: /large\.spec/, use: { viewport: { width: 1366, height: 860 } } }
  ]
});
