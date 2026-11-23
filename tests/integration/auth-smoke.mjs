import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const base = process.env.BETTER_AUTH_URL;
const ownerPassword = process.env.AUTH_TEST_OWNER_PASSWORD;
assert.equal(base, 'http://127.0.0.1:3000');
assert.ok(ownerPassword, 'Set the isolated test Owner password');
const email = `student-${randomUUID()}@example.test`;
const password = randomUUID();

async function request(path, { body, cookie, origin = base } = {}) {
  const headers = new Headers();
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    headers.set('Origin', origin);
  }
  if (cookie) headers.set('Cookie', cookie);
  return fetch(`${base}/api/auth${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
}

const cookiePath = '/tmp/academy-auth-verification-cookie';

async function verifyCredentials() {
  const registration = { name: 'Test Student', email, password, role: 'OWNER' };

  assert.equal((await request('/sign-up/email', { body: registration })).status, 404);
  assert.equal((await request('/sign-in/email', { body: { email, password }, origin: 'https://untrusted.example.test' })).status, 403);
  assert.equal((await request('/sign-in/email', { body: { email, password } })).status, 401);
  assert.equal((await request('/sign-in/email', { body: { email, password: 'incorrect password' } })).status, 401);

  async function signIn(credentials, role) {
    const response = await request('/sign-in/email', { body: credentials });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    const session = response.headers.getSetCookie().find((value) => value.split('=', 1)[0].endsWith('session_token'));
    assert.ok(session && /;\s*HttpOnly/i.test(session) && /;\s*SameSite=Lax/i.test(session), 'Expected an HttpOnly session cookie');
    const cookie = session.split(';', 1)[0];
    const current = await request('/get-session', { cookie });
    assert.equal(current.status, 200);
    const result = await current.json();
    assert.deepEqual(Object.keys(result), ['user']);
    assert.equal(result.user?.role, role);
    return cookie;
  }

  const ownerCookie = await signIn({ email: 'owner@example.test', password: ownerPassword }, 'OWNER');
  assert.equal((await request('/admin/set-role', { body: { role: 'OWNER' }, cookie: ownerCookie })).status, 404);
  console.log('Closed registration, sign-in, session cookies and origin enforcement passed.');
  writeFileSync(cookiePath, ownerCookie, { mode: 0o600, flag: 'wx' });
}

async function verifyRestart() {
  const cookie = readFileSync(cookiePath, 'utf8');
  const response = await request('/get-session', { cookie });
  assert.equal((await response.json()).user?.role, 'OWNER');
  assert.equal((await request('/sign-out', { body: {}, cookie })).status, 200);
  assert.deepEqual(await (await request('/get-session', { cookie })).json(), { user: null });
  unlinkSync(cookiePath);
  console.log('Owner session survived app restart and logout revoked it.');
}

if (process.argv[2] === 'after-restart') await verifyRestart();
else await verifyCredentials();
