import { defineConfig, devices } from '@playwright/test';

const port = 14983;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
  },
  webServer: {
    command: `AI_SDK_DEVTOOLS_PORT=${port} pnpm tsx src/viewer/server.ts`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
