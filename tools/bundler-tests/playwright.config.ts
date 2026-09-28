import { defineConfig } from '@playwright/test';

const consumer = process.env.BUNDLER_TEST_CONSUMER;
const port = process.env.BUNDLER_TEST_PORT;
if (!consumer || !port) {
  throw new Error('Run these tests with pnpm test:bundlers.');
}
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests',
  outputDir: `./test-results/zod-${process.env.BUNDLER_TEST_ZOD}`,
  reporter: process.env.CI ? 'github' : 'list',
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: { baseURL, browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: {
    cwd: consumer,
    command: `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
