import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import { readDatabaseUrl } from '../../src/db/env';

const origin = 'http://127.0.0.1:3100';
const ownerPassword = process.env.AUTH_TEST_OWNER_PASSWORD;

function post(request: APIRequestContext, path: string, data: object) {
  return request.post(path, { headers: { Origin: origin }, data });
}

async function register(request: APIRequestContext) {
  const email = `learner-${randomUUID()}@example.test`;
  const password = randomUUID();
  expect((await post(request, '/api/auth/sign-up/email', { name: 'Test learner', email, password })).status()).toBe(200);
  return { email, password };
}

test.describe('identity on a dedicated database', () => {
  test.skip(!ownerPassword, 'The Phase 2 isolation runner supplies an Owner and an identity database');

  test('Arabic registration and sign-in, protected redirect, failed login and logout', async ({ page }) => {
    await page.goto('/ar/profile');
    await expect(page).toHaveURL(/\/ar\/login\?next=/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const email = `learner-${randomUUID()}@example.test`;
    const password = randomUUID();
    await page.getByRole('link', { name: 'إنشاء حساب' }).last().click();
    await page.getByLabel('الاسم').fill('متعلم');
    await page.getByLabel('البريد الإلكتروني').fill(email);
    await page.getByLabel('كلمة المرور').fill(password);
    await page.getByRole('button', { name: 'إنشاء حساب' }).click();
    await expect(page).toHaveURL(/\/ar\/login\?.*registered=1/);
    await page.getByLabel('البريد الإلكتروني').fill(email);
    await page.route('**/api/auth/sign-in/email', (route) => route.fulfill({ status: 503 }), { times: 1 });
    await page.getByLabel('كلمة المرور').fill(password);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(page.locator('form.identity-form').getByRole('alert')).toContainText('تعذّر الاتصال بخدمة الحسابات');
    await page.getByLabel('كلمة المرور').fill('wrong password');
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(page.locator('form.identity-form').getByRole('alert')).toContainText('تحقّق من البيانات');
    await page.getByLabel('كلمة المرور').fill(password);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(page).toHaveURL(/\/ar\/profile$/);
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await expect(page.getByRole('navigation').getByText('إدارة المستخدمين')).toHaveCount(0);
    await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
    await expect(page).toHaveURL(/\/ar$/);
    await expect(page.getByRole('navigation').getByText('تسجيل الدخول')).toBeVisible();
  });

  test('Owner and Admin boundaries, role and status revocation, and session expiry', async ({ playwright, page }) => {
    if (!ownerPassword) throw new Error('Missing test Owner');
    const student = await playwright.request.newContext({ baseURL: origin });
    const admin = await playwright.request.newContext({ baseURL: origin });
    const pool = new Pool({ connectionString: readDatabaseUrl() });

    try {
      expect((await student.get('/api/admin/users')).status()).toBe(401);
      const learner = await register(student);
      const administrator = await register(admin);
      expect((await post(student, '/api/auth/sign-in/email', learner)).status()).toBe(200);
      expect((await student.get('/api/admin/users')).status()).toBe(403);
      expect((await student.get('/api/instructor')).status()).toBe(403);

      await page.goto('/en/login?next=%2Fen%2Fadmin');
      await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
      await page.getByLabel('Email address').fill('owner@example.test');
      await page.getByLabel('Password').fill(ownerPassword);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/en\/admin$/);
      const listing = await page.request.get('/api/admin/users');
      expect(listing.status()).toBe(200);
      const entries = (await listing.json()).users;
      const learnerId = entries.find((entry: { email: string }) => entry.email === learner.email).id;
      const administratorId = entries.find((entry: { email: string }) => entry.email === administrator.email).id;
      const ownerId = entries.find((entry: { role: string }) => entry.role === 'OWNER').id;
      const roleChange = (id: string, role: string) => ({ operation: 'role', id, role });
      expect((await post(page.request, '/api/admin/users', roleChange(ownerId, 'STUDENT'))).status()).toBe(403);
      const userRow = page.getByRole('listitem').filter({ hasText: administrator.email });
      await userRow.getByLabel('Role').selectOption('ADMIN');
      await userRow.getByRole('button', { name: 'Save role' }).click();
      await expect(page.getByRole('status')).toHaveText('Account updated.');
      expect((await post(admin, '/api/auth/sign-in/email', administrator)).status()).toBe(200);
      expect((await admin.get('/api/admin/users')).status()).toBe(200);
      expect((await post(admin, '/api/admin/users', roleChange(administratorId, 'OWNER'))).status()).toBe(400);
      expect((await post(admin, '/api/admin/users', roleChange(learnerId, 'ADMIN'))).status()).toBe(403);
      expect((await post(admin, '/api/admin/users', roleChange(learnerId, 'INSTRUCTOR'))).status()).toBe(200);
      expect(await (await student.get('/api/auth/get-session')).json()).toEqual({ user: null });
      expect((await post(student, '/api/auth/sign-in/email', learner)).status()).toBe(200);
      expect((await student.get('/api/instructor')).status()).toBe(200);
      expect((await student.get('/api/admin/users')).status()).toBe(403);

      expect((await post(admin, '/api/admin/users', { operation: 'status', id: learnerId, banned: true })).status()).toBe(200);
      expect((await student.get('/api/instructor')).status()).toBe(401);
      expect((await post(admin, '/api/admin/users', { operation: 'status', id: learnerId, banned: false })).status()).toBe(200);
      expect((await post(student, '/api/auth/sign-in/email', learner)).status()).toBe(200);
      await pool.query('update identity.session set expires_at = now() - interval \'1 second\' where user_id = $1', [learnerId]);
      expect((await student.get('/api/instructor')).status()).toBe(401);
      const audit = await pool.query('select count(*)::integer as count from identity.audit_event where target_id = $1', [learnerId]);
      expect(audit.rows[0].count).toBe(3);
    } finally {
      await Promise.all([student.dispose(), admin.dispose(), pool.end()]);
    }
  });
});
