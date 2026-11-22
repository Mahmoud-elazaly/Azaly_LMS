import { loadEnvConfig } from '@next/env';
import { defineConfig, devices } from '@playwright/test';

loadEnvConfig(process.cwd());
const baseURL = 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: { ...devices['Desktop Chrome'], baseURL },
  webServer: {
    command: 'pnpm start --hostname 127.0.0.1 --port 3100',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
