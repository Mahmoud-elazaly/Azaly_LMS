import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { readDatabaseUrl } from '../../src/db/env';
import { identityCopy } from '../../src/features/identity/copy';
import { createTestLearner } from './test-accounts';

const origin = 'http://127.0.0.1:3100';
const ownerPassword = process.env.AUTH_TEST_OWNER_PASSWORD;

function post(request: APIRequestContext, path: string, data: object) {
  return request.post(path, { headers: { Origin: origin }, data });
}

function signIn(request: APIRequestContext, email: string, password: string) {
  return post(request, '/api/auth/sign-in/email', { email, password });
}

async function invitationFor(recipient: string) {
  const message = await fetch(`http://127.0.0.1:3101/messages?recipient=${encodeURIComponent(recipient)}`, {
    headers: { Authorization: 'Bearer isolated-playwright-mail' },
  });
  expect(message.status).toBe(200);
  const { text }: { text: string } = await message.json();
  const url = text.split('\n').find((line) => line.startsWith(origin));
  if (!url) throw new Error('Invitation email has no activation link');
  return new URL(url);
}

async function checkLayout(page: Page, route: string, heading: string) {
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const mode of ['system', 'light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode === 'light' ? 'dark' : 'light' });
      await page.goto(route);
      const theme = page.locator('form.theme-controls');
      await theme.locator(`[value="${mode}"]`).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
      const locale = route.split('/')[1];
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      await expect(page.locator('html')).toHaveCSS('color-scheme', mode === 'dark' ? 'dark' : 'light');
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  }
}

test.describe('credential form before hydration', () => {
  test.use({ javaScriptEnabled: false });

  test('keeps credentials out of the URL before the account form hydrates', async ({ page }) => {
    await page.goto('/en/login');
    const form = page.locator('form.identity-form');
    await expect(form).toHaveAttribute('method', 'post');
    await expect(form.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    await expect(form.getByText('Loading the account form. If it stays unavailable, enable JavaScript.')).toBeVisible();
    await form.getByLabel('Email address').fill('learner@example.test');
    const password = form.getByLabel('Password', { exact: true });
    await password.fill('sample-only-passphrase');
    await password.press('Enter');
    await expect(page).toHaveURL(/\/en\/login$/);
  });
});

test('sign-in remains centered and usable across locale, theme and viewport changes', async ({ page, request }) => {
  test.setTimeout(90000);
  for (const locale of ['en', 'ar'] as const) {
    const t = identityCopy(locale);
    await checkLayout(page, `/${locale}/login`, t.welcomeBack);
    const form = page.locator('form.identity-form');
    const email = form.getByLabel(t.email);
    const password = form.getByLabel(t.password, { exact: true });
    await expect(email).toHaveAttribute('dir', 'ltr');
    await expect(password).toHaveAttribute('dir', 'ltr');
    await form.getByRole('button', { name: t.login }).click();
    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await form.getByRole('button', { name: t.showPassword }).click();
    await expect(password).toHaveAttribute('type', 'text');
    const help = form.getByRole('button', { name: t.help });
    await help.focus();
    await help.press('Enter');
    await expect(page.getByRole('dialog', { name: t.helpTitle })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(help).toBeFocused();
    await expect(page.locator('a[href$="/register"]')).toHaveCount(0);
    expect((await request.get(`/${locale}/register`)).status()).toBe(404);
    const cardPosition = await page.locator('.account-card').boundingBox();
    expect(Math.abs((cardPosition?.x ?? 0) * 2 + (cardPosition?.width ?? 0) - 1280)).toBeLessThan(3);
  }
  await page.locator('form.theme-controls [value="system"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await page.goto('/en/login');
  await page.goto('/');
  await expect(page).toHaveURL(/\/en$/);
});

test.describe('identity on a dedicated database', () => {
  test.skip(!ownerPassword, 'The isolation runner supplies an Owner and an identity database');

  test('Owner invites a learner, who activates and signs in in Arabic with a one-use link', async ({ page, browser, request }) => {
    test.setTimeout(90000);
    if (!ownerPassword) throw new Error('Missing isolated Owner credentials');
    const admin = await browser.newPage();
    const email = `invited-${randomUUID()}@example.test`;
    const password = randomUUID();
    try {
      expect((await post(request, '/api/auth/sign-up/email', { email, password, name: 'Closed signup' })).status()).toBe(404);
      const unauthorized = { operation: 'invite', name: 'Test learner', email, role: 'STUDENT', locale: 'ar' };
      expect((await post(request, '/api/admin/users', unauthorized)).status()).toBe(401);
      await page.goto('/ar/admin/users');
      await expect(page).toHaveURL(/\/ar\/login\?next=/);
      expect((await signIn(admin.request, 'owner@example.test', ownerPassword)).status()).toBe(200);
      await admin.goto('/en/admin/users');
      await expect(admin.getByRole('navigation', { name: 'Administration navigation' }).getByRole('link', { name: 'Users' }))
        .toHaveAttribute('aria-current', 'page');
      await admin.getByRole('button', { name: 'Invite user' }).click();
      const dialog = admin.getByRole('dialog', { name: 'Invite a new user' });
      await dialog.getByLabel('Full name').fill('متعلّم جديد');
      await dialog.getByLabel('Email address').fill(email);
      await dialog.getByLabel('Preferred language').selectOption('ar');
      await dialog.getByRole('button', { name: 'Invite user' }).click();
      await expect(admin.getByText('Invitation accepted by the email service.')).toBeVisible();
      expect((await post(admin.request, '/api/admin/users', { ...unauthorized, email: email.toUpperCase() })).status()).toBe(409);

      const activation = await invitationFor(email);
      const token = activation.hash.slice(1);
      expect(activation.pathname).toBe('/ar/activate');
      const t = identityCopy('ar');
      await page.goto(activation.href);
      await page.getByLabel(t.password, { exact: true }).fill(password);
      await page.getByLabel(t.passwordConfirmation).fill(password);
      await page.getByRole('button', { name: t.activate }).click();
      await expect(page.getByText(t.activated)).toBeVisible();
      expect((await post(request, '/api/auth/activate', { token, password })).status()).toBe(400);
      expect((await post(admin.request, '/api/admin/users', unauthorized)).status()).toBe(409);

      await page.getByLabel(t.email).fill(email);
      await page.route('**/api/auth/sign-in/email', (route) => route.fulfill({ status: 503 }), { times: 1 });
      await page.getByLabel(t.password, { exact: true }).fill(password);
      await page.getByRole('button', { name: t.login }).click();
      await expect(page.locator('form.identity-form').getByRole('alert')).toHaveText(t.unavailable);
      await page.getByLabel(t.password, { exact: true }).fill('wrong password');
      await page.getByRole('button', { name: t.login }).click();
      await expect(page.locator('form.identity-form').getByRole('alert')).toHaveText(t.invalidCredentials);
      await page.getByLabel(t.password, { exact: true }).fill(password);
      await page.getByLabel(t.password, { exact: true }).press('Enter');
      await expect(page).toHaveURL(/\/ar\/dashboard$/);
      expect((await post(page.request, '/api/admin/users', unauthorized)).status()).toBe(403);
      await page.getByRole('button', { name: t.logout }).click();
      await expect(page).toHaveURL(/\/ar$/);
    } finally {
      await admin.close();
    }
  });

  test('expired, rotated and revoked links fail, and provider failure remains visible', async ({ playwright }) => {
    if (!ownerPassword) throw new Error('Missing isolated Owner credentials');
    const owner = await playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: { 'x-academy-client-ip': '127.0.0.2' } });
    const pool = new Pool({ connectionString: readDatabaseUrl() });
    const email = `expired-${randomUUID()}@example.test`;
    const password = randomUUID();

    try {
      expect((await signIn(owner, 'owner@example.test', ownerPassword)).status()).toBe(200);
      const invitation = { operation: 'invite', email, name: 'Expiry test', role: 'INSTRUCTOR' };
      expect((await owner.post('/api/admin/users', { data: invitation, headers: { Origin: 'https://untrusted.example.test' } })).status())
        .toBe(403);
      expect((await post(owner, '/api/admin/users', invitation)).status()).toBe(200);
      const original = (await invitationFor(email)).hash.slice(1);
      const directory = await owner.get(`/api/admin/users?q=${encodeURIComponent(email)}&status=invited`);
      const { users: [{ id }] } = await directory.json();
      expect((await post(owner, '/api/admin/users', { operation: 'edit', id, name: 'Edited invitation', role: 'STUDENT' })).status()).toBe(200);
      const edited = await owner.get(`/api/admin/users?q=${encodeURIComponent(email)}&role=STUDENT`);
      expect((await edited.json()).users).toMatchObject([{ id, name: 'Edited invitation', status: 'invited' }]);
      await pool.query("UPDATE identity.invitation SET expires_at = now() - interval '1 minute' WHERE id = $1", [id]);
      expect((await post(owner, '/api/auth/activate', { token: original, password })).status()).toBe(400);
      expect((await post(owner, '/api/admin/users', { operation: 'resend', id })).status()).toBe(200);
      const rotated = (await invitationFor(email)).hash.slice(1);
      expect(rotated).not.toBe(original);
      expect((await post(owner, '/api/auth/activate', { token: original, password })).status()).toBe(400);
      expect((await post(owner, '/api/admin/users', { operation: 'revoke', id })).status()).toBe(200);
      expect((await post(owner, '/api/auth/activate', { token: rotated, password })).status()).toBe(400);

      const failed = await post(owner, '/api/admin/users', { ...invitation, email: `undeliverable-${email}` });
      expect(failed.status()).toBe(202);
      expect(await failed.json()).toEqual({ ok: true, delivery: 'failed' });
      const audited = await pool.query('SELECT action FROM identity.audit_event WHERE target_id = $1', [id]);
      expect(audited.rows.map(({ action }) => action)).toEqual(expect.arrayContaining(['invitation.invite', 'invitation.resend', 'invitation.revoke']));
    } finally {
      await Promise.all([owner.dispose(), pool.end()]);
    }
  });

  test('Owner and Admin boundaries protect the dashboard and revoke account sessions on role and status changes', async ({ playwright, page }) => {
    test.setTimeout(90000);
    if (!ownerPassword) throw new Error('Missing isolated Owner credentials');
    const student = await playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: { 'x-academy-client-ip': '127.0.0.3' } });
    const admin = await playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: { 'x-academy-client-ip': '127.0.0.4' } });
    const pool = new Pool({ connectionString: readDatabaseUrl() });

    try {
      expect((await student.get('/api/admin/users')).status()).toBe(401);
      const learner = await createTestLearner();
      const administrator = await createTestLearner('Admin candidate');
      expect((await signIn(student, learner.email, learner.password)).status()).toBe(200);
      expect((await student.get('/api/admin/users')).status()).toBe(403);
      expect((await student.get('/api/instructor')).status()).toBe(403);
      expect((await signIn(page.request, 'owner@example.test', ownerPassword)).status()).toBe(200);

      await page.goto('/en/admin/users');
      const listing = await page.request.get('/api/admin/users?role=OWNER');
      const ownerId = (await listing.json()).users[0].id;
      expect((await post(page.request, '/api/admin/users', { operation: 'status', id: ownerId, banned: true })).status()).toBe(403);
      const filters = page.locator('.admin-filters');
      await filters.getByLabel('Search by name or email').fill(administrator.email);
      await filters.getByLabel('Account status').selectOption('active');
      await filters.getByLabel('Sort by').selectOption('name');
      await filters.getByRole('button', { name: 'Apply filters' }).click();
      const userRow = page.getByRole('row').filter({ hasText: administrator.email });
      await userRow.getByRole('button', { name: 'Edit' }).click();
      const dialog = page.getByRole('dialog', { name: 'Edit user' });
      await dialog.getByLabel('Full name').fill('Updated administrator');
      await dialog.getByLabel('Role').selectOption('ADMIN');
      await dialog.getByRole('checkbox').check();
      await dialog.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByText('Account updated.')).toBeVisible();
      await expect(userRow.getByText('Updated administrator')).toBeVisible();

      expect((await signIn(admin, administrator.email, administrator.password)).status()).toBe(200);
      expect((await admin.get('/api/admin/users')).status()).toBe(200);
      expect((await post(admin, '/api/admin/users', { operation: 'role', id: learner.id, role: 'ADMIN' })).status()).toBe(403);
      expect((await post(admin, '/api/admin/users', { operation: 'invite', name: 'Blocked', email: 'blocked@example.test', role: 'ADMIN' }))
        .status()).toBe(403);
      expect((await post(admin, '/api/admin/users', {
        operation: 'invite', name: 'Invited by an administrator', email: `admin-invite-${randomUUID()}@example.test`, role: 'STUDENT',
      })).status()).toBe(200);
      expect((await post(admin, '/api/admin/users', { operation: 'role', id: learner.id, role: 'INSTRUCTOR' })).status()).toBe(200);
      expect(await (await student.get('/api/auth/get-session')).json()).toEqual({ user: null });
      expect((await signIn(student, learner.email, learner.password)).status()).toBe(200);
      expect((await student.get('/api/instructor')).status()).toBe(200);
      expect((await post(student, '/api/admin/users', { operation: 'status', id: learner.id, banned: true })).status()).toBe(403);

      expect((await post(admin, '/api/admin/users', { operation: 'status', id: learner.id, banned: true })).status()).toBe(200);
      expect((await student.get('/api/instructor')).status()).toBe(401);
      expect((await signIn(student, learner.email, learner.password)).status()).toBe(401);
      expect((await post(admin, '/api/admin/users', { operation: 'status', id: learner.id, banned: false })).status()).toBe(200);
      expect((await signIn(student, learner.email, learner.password)).status()).toBe(200);
      await pool.query("UPDATE identity.session SET expires_at = now() - interval '1 second' WHERE user_id = $1", [learner.id]);
      expect((await student.get('/api/instructor')).status()).toBe(401);

      for (const locale of ['ar', 'en'] as const) {
        await checkLayout(page, `/${locale}/admin/users`, identityCopy(locale).admin);
        await expect(page.getByRole('table')).toBeVisible();
      }
    } finally {
      await Promise.all([student.dispose(), admin.dispose(), pool.end()]);
    }
  });

  test('directory results are sorted and paginated after role and search filters', async ({ playwright }) => {
    if (!ownerPassword) throw new Error('Missing isolated Owner credentials');
    const owner = await playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: { 'x-academy-client-ip': '127.0.0.5' } });
    const pool = new Pool({ connectionString: readDatabaseUrl() });
    const cohort = randomUUID();
    try {
      await pool.query(`
        INSERT INTO identity."user" (id, name, email)
        SELECT gen_random_uuid()::text, 'Cohort learner ' || lpad(number::text, 2, '0'),
          $1 || '-' || number || '@example.test'
        FROM generate_series(1, 13) AS rows(number)
      `, [cohort]);
      expect((await signIn(owner, 'owner@example.test', ownerPassword)).status()).toBe(200);
      const query = `/api/admin/users?q=${cohort}&role=STUDENT&status=active&sort=name`;
      const first = await owner.get(query);
      expect(first.status()).toBe(200);
      const firstPage = await first.json();
      expect(firstPage).toMatchObject({ total: 13, page: 1, pages: 2 });
      expect(firstPage.users.map(({ name }: { name: string }) => name)).toEqual(
        Array.from({ length: 12 }, (_, index) => `Cohort learner ${String(index + 1).padStart(2, '0')}`),
      );
      const last = await owner.get(`${query}&page=2`);
      expect(await last.json()).toMatchObject({ page: 2, users: [{ name: 'Cohort learner 13' }] });
    } finally {
      await Promise.all([owner.dispose(), pool.end()]);
    }
  });
});
