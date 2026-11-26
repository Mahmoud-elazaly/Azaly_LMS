import { createHmac } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import { readDatabaseUrl } from '../../src/db/env';
import { createTestLearner } from './test-accounts';

const origin = 'http://127.0.0.1:3100';
const post = (request: APIRequestContext, path: string, data: object, requestOrigin = origin) =>
  request.post(path, { data, headers: { Origin: requestOrigin } });

test('rejects unauthenticated and cross-origin access with private responses', async ({ page, request }) => {
  test.skip(process.env.PHASE11_TEST !== '1', 'Use the isolated Phase 11 gate.');
  const publicPage = await request.get('/ar');
  expect(publicPage.headers()).toMatchObject({
    'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
  });
  expect(publicPage.headers()['permissions-policy']).toContain('microphone=()');
  expect((await request.post('/api/auth/sign-up/email', { data: {} })).status()).toBe(404);

  for (const path of ['/api/admin/users', '/api/authoring', '/api/question-bank', '/api/guided-reviews?locale=en',
    '/api/learning?locale=en', '/api/real-lab', '/api/mastery?locale=en', '/api/interview/history']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(401);
    expect(response.headers()['cache-control'], path).toBe('no-store');
  }

  const learner = await createTestLearner('Production boundary learner');
  const credentials = { email: learner.email, password: learner.password };
  expect((await post(page.request, '/api/auth/sign-in/email', credentials)).status()).toBe(200);
  for (const path of ['/api/learning', '/api/learning/guided-labs', '/api/real-lab', '/api/interview/start']) {
    expect((await post(page.request, path, {}, 'https://unrelated.example.test')).status(), path).toBe(403);
  }
  expect((await page.request.get('/api/authoring')).status()).toBe(403);
  const oversized = await page.request.post('/api/auth/sign-in/email', {
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    data: ' '.repeat(4096) + JSON.stringify(credentials),
  });
  expect(oversized.status()).toBe(400);
  expect(await oversized.json()).toEqual({ error: 'AUTH_REQUEST_REJECTED' });

  const pool = new Pool({ connectionString: readDatabaseUrl() });
  try {
    await pool.query("UPDATE identity.session SET impersonated_by = 'phase11-fixture' WHERE user_id = $1", [learner.id]);
    expect(await (await page.request.get('/api/auth/get-session')).json()).toEqual({ user: null });
    expect((await page.request.get('/api/learning?locale=en')).status()).toBe(401);
  } finally {
    await pool.end();
  }
});

test('enforces the shared account budget before sign-in and keeps another account available', async ({ request }) => {
  test.skip(process.env.PHASE11_TEST !== '1', 'Use the isolated Phase 11 gate.');
  const [limited, other] = await Promise.all([createTestLearner('Limited learner'), createTestLearner('Separate learner')]);
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('Missing isolated auth secret');
  const bucket = createHmac('sha256', secret).update(`sign-in:${limited.email.toLowerCase()}`).digest('hex');
  const pool = new Pool({ connectionString: readDatabaseUrl() });
  try {
    await pool.query(`INSERT INTO identity.account_rate_limit (bucket, attempts, resets_at)
      VALUES ($1, 20, now() + interval '1 minute')`, [bucket]);
    const denied = await post(request, '/api/auth/sign-in/email', { email: limited.email.toUpperCase(), password: limited.password });
    expect(denied.status()).toBe(429);
    expect(denied.headers()['retry-after']).toBe('60');
    expect(await denied.json()).toEqual({ error: 'RATE_LIMITED' });
    expect((await post(request, '/api/auth/sign-in/email', { email: other.email, password: other.password })).status()).toBe(200);
    await pool.query("UPDATE identity.account_rate_limit SET resets_at = now() - interval '1 second' WHERE bucket = $1", [bucket]);
    expect((await post(request, '/api/auth/sign-in/email', { email: limited.email, password: limited.password })).status()).toBe(200);
  } finally {
    await pool.end();
  }
});
