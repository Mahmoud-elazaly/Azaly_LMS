import { loadEnvConfig } from '@next/env';
import { defineConfig, devices } from '@playwright/test';

loadEnvConfig(process.cwd());
const baseURL = 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: { ...devices['Desktop Chrome'], baseURL },
  webServer: {
    command: 'cp -R .next/static .next/standalone/.next/ && HOSTNAME=127.0.0.1 PORT=3100 node .next/standalone/server.js',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
