import { defineConfig, devices } from '@playwright/test';

/**
 * Testy v reálném prohlížeči.
 *
 * Model se testuje ve vitestu nad linkedom, jenže ten se od prohlížeče liší —
 * nenormalizuje CRLF, nemá výběr a nezná `beforeinput`. Kvůli tomu prošla ve
 * fázi F0 celá sada zeleně u chování, které v Chrome neplatilo. Cokoli kolem
 * výběru, kláves, bílých znaků a lišty patří sem.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'line' : [['list']],
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node tools/build.mjs && node tools/serve.mjs',
    url: 'http://localhost:4321/e2e.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
