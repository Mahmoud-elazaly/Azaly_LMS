import { loadEnvConfig } from '@next/env';
import { defineConfig, devices } from '@playwright/test';

loadEnvConfig(process.cwd());
const baseURL = 'http://127.0.0.1:3100';
const withInterviewStub = process.env.PHASE10_TEST === '1';
const withTestAccounts = Boolean(process.env.AUTH_TEST_OWNER_PASSWORD);
const web = {
  command: 'cp -R .next/static .next/standalone/.next/ && HOSTNAME=127.0.0.1 PORT=3100 node .next/standalone/server.js',
  url: `${baseURL}/api/health`,
  reuseExistingServer: false,
  timeout: 60_000,
  env: withTestAccounts ? {
    INVITATION_MAIL_URL: 'http://127.0.0.1:3101/emails',
    INVITATION_MAIL_API_KEY: 'isolated-playwright-mail',
    INVITATION_MAIL_FROM: 'invitations@example.test',
    ...(withInterviewStub && { AZALY_INTERVIEW_TEST_TRANSPORT: '1', GEMINI_API_KEY: '' }),
  } : undefined,
};

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: { ...devices['Desktop Chrome'], baseURL },
  webServer: withTestAccounts ? [
    {
      command: 'node tests/integration/invitation-mail-capture.mjs',
      url: 'http://127.0.0.1:3101/health',
      reuseExistingServer: false,
    },
    ...(withInterviewStub ? [{
      command: 'node tests/integration/interview-gemini-stub.mjs',
      url: 'http://127.0.0.1:3102/health',
      reuseExistingServer: false,
    }] : []),
    web,
  ] : web,
});
