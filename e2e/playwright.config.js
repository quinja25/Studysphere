'use strict';

// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright E2E configuration.
 *
 * Tests run against a locally-running CRA dev server (port 3000).
 * Start both servers before running:
 *   cd server && npm start
 *   cd client && npm start
 * Then: cd e2e && npx playwright test
 *
 * To run against a custom URL: BASE_URL=http://my-host:3000 npx playwright test
 */

module.exports = defineConfig({
    testDir: './tests',
    timeout: 30_000,
    retries: process.env.CI ? 2 : 0,
    workers: 1, // keep sequential — tests share localStorage helpers

    reporter: [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ],

    use: {
        baseURL: process.env.BASE_URL || 'http://localhost:3000',
        headless: true,
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        actionTimeout: 10_000,
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
