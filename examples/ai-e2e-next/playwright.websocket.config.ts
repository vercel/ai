import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.WEBSOCKET_CHAT_TEST_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;
const socketPort = port + 1;

export default defineConfig({
  testDir: './tests/websocket',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    timezoneId: 'America/Los_Angeles',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm dev:websocket',
      url: `http://127.0.0.1:${socketPort}/health`,
      env: {
        WEBSOCKET_CHAT_PORT: String(socketPort),
        WEBSOCKET_CHAT_ORIGIN: baseURL,
        WEBSOCKET_CHAT_MOCK: '1',
      },
      reuseExistingServer: false,
    },
    {
      command: `pnpm dev --hostname 127.0.0.1 --port ${port}`,
      url: `${baseURL}/chat/websocket`,
      env: {
        NEXT_PUBLIC_WEBSOCKET_CHAT_URL: `ws://127.0.0.1:${socketPort}/chat`,
      },
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
