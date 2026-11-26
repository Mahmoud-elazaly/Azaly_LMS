import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const origin = 'https://academy.example.test';
const local = 'http://127.0.0.1:3103';
const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, BETTER_AUTH_URL: origin, HOSTNAME: '127.0.0.1', PORT: '3103' },
  stdio: 'ignore',
});
const exited = once(server, 'exit');
try {
  let ready = false;
  for (let attempt = 0; attempt < 30 && server.exitCode === null; attempt++) {
    const response = await fetch(local + '/api/health', { signal: AbortSignal.timeout(1000) }).catch(() => null);
    if (response?.ok) {
      ready = true;
      break;
    }
    await delay(500);
  }
  assert.ok(ready, 'HTTPS-configured standalone instance did not start');
  const response = await fetch(local + '/api/auth/sign-in/email', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' },
    body: JSON.stringify({ email: 'owner@example.test', password: process.env.AUTH_TEST_OWNER_PASSWORD }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  const session = response.headers.getSetCookie().find((value) => value.startsWith('__Secure-better-auth.session_token='));
  assert.ok(session && /;\s*Secure(?:;|$)/i.test(session) && /;\s*HttpOnly(?:;|$)/i.test(session)
    && /;\s*SameSite=Lax(?:;|$)/i.test(session) && !/;\s*Domain=/i.test(session),
  'Expected a Secure, HttpOnly, SameSite=Lax host-only session cookie');
  console.log('HTTPS-origin standalone session cookie checks passed.');
} finally {
  server.kill();
  await exited;
}
