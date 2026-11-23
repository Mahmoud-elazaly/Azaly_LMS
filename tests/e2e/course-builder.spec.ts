import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createTestLearner } from './test-accounts';

const origin = 'http://127.0.0.1:3100';
const ownerPassword = process.env.AUTH_TEST_OWNER_PASSWORD;

function post(request: APIRequestContext, path: string, data: object) {
  return request.post(path, { headers: { Origin: origin }, data });
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/en/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
}

function editor(page: Page) {
  return page.locator('form.builder-fields');
}

async function createCourse(page: Page, slug: string, english: string, arabic: string) {
  await page.goto('/en/builder');
  await page.getByLabel('Course slug').first().fill(slug);
  await page.getByRole('button', { name: 'Create course' }).click();
  await expect(page).toHaveURL(/\/en\/builder\?id=/);
  await page.getByLabel('Course title').fill(english);
  await page.getByLabel('Course summary').fill('A practical introduction.');
  await page.getByRole('button', { name: 'Add module' }).click();
  await page.getByLabel('Module title').fill('Getting started');
  await page.getByRole('button', { name: 'Add lesson' }).click();
  await page.getByLabel('Lesson title').fill('First steps');
  await page.getByRole('button', { name: 'Add block' }).click();
  await page.getByLabel('Block type').selectOption('code');
  await page.getByLabel('Block content').fill('uname -a');
  await page.getByLabel('Content language').selectOption('ar');
  await page.getByLabel('Course title').fill(arabic);
  await page.getByLabel('Course summary').fill('مقدمة عملية');
  await page.getByLabel('Module title').fill('البداية');
  await page.getByLabel('Lesson title').fill('الخطوات الأولى');
  await page.getByLabel('Block content').fill('printf "مرحبا"');
  await expect(page.getByLabel('Block content')).toHaveAttribute('dir', 'ltr');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(editor(page).getByRole('status')).toHaveText('Draft saved.');
  return new URL(page.url()).searchParams.get('id');
}

test.describe('course builder on the isolated database', () => {
  test.skip(process.env.PHASE3_TEST !== '1', 'The Phase 3 runner provisions authoring credentials');

  test('enforces author scope and publishes independent course revisions through the browser', async ({ browser, page, request }) => {
    test.setTimeout(90000);
    if (!ownerPassword) throw new Error('Missing isolated Owner credentials');
    expect((await request.get('/api/authoring')).status()).toBe(401);
    expect((await post(request, '/api/authoring', { operation: 'create', slug: 'blocked' })).status()).toBe(401);
    await page.goto('/ar/builder');
    await expect(page).toHaveURL(/\/ar\/login\?next=/);

    const student = await createTestLearner();
    await signIn(page, student.email, student.password);
    await page.goto('/en/builder');
    await expect(page.getByText('You do not have access to this course builder.')).toBeVisible();
    expect((await page.request.get('/api/authoring')).status()).toBe(403);
    expect((await post(page.request, '/api/authoring', { operation: 'create', slug: 'blocked' })).status()).toBe(403);

    const other = await createTestLearner();
    const owner = await browser.newPage();
    const secondInstructor = await browser.newPage();
    try {
      await signIn(owner, 'owner@example.test', ownerPassword);
      for (const { id } of [student, other]) {
        expect((await post(owner.request, '/api/admin/users', { operation: 'role', id, role: 'INSTRUCTOR' })).status()).toBe(200);
      }
      await signIn(page, student.email, student.password);
      await signIn(secondInstructor, other.email, other.password);
      await expect(page.getByRole('navigation').getByRole('link', { name: 'Course builder' })).toBeVisible();

      await page.goto('/ar/builder');
      await expect(page.getByRole('heading', { name: 'منشئ الدورات' })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      const id = await createCourse(page, 'linux-administration', 'Linux Administration', 'إدارة لينكس');
      expect(id).toBeTruthy();
      expect((await secondInstructor.request.get(`/api/authoring?id=${id}`)).status()).toBe(403);
      expect((await post(secondInstructor.request, '/api/authoring', { operation: 'publish', id, version: 2 })).status()).toBe(403);
      expect((await request.get('/en/courses/linux-administration')).status()).toBe(404);
      await owner.goto('/ar/courses');
      await expect(owner.getByText('إدارة لينكس')).toHaveCount(0);

      expect((await post(page.request, '/api/authoring', { operation: 'publish', id, version: 1 })).status()).toBe(409);
      await page.getByRole('button', { name: 'Publish', exact: true }).click();
      await expect(editor(page).getByRole('status')).toHaveText('Course published.');
      await owner.goto('/ar/courses');
      await expect(owner.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(owner.getByRole('link', { name: 'إدارة لينكس' })).toBeVisible();
      await owner.goto('/en/courses');
      await expect(owner.locator('html')).toHaveAttribute('dir', 'ltr');
      await expect(owner.getByRole('link', { name: 'Linux Administration' })).toBeVisible();

      await page.getByLabel('Content language').selectOption('en');
      await page.getByLabel('Course title').fill('Linux Administration Revised');
      await page.getByRole('button', { name: 'Save draft' }).click();
      await expect(editor(page).getByRole('status')).toHaveText('Draft saved.');
      await owner.goto('/en/courses/linux-administration');
      await expect(owner.getByRole('heading', { name: 'Linux Administration', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Republish' }).click();
      await expect(editor(page).getByRole('status')).toHaveText('Course published.');
      await owner.reload();
      await expect(owner.getByRole('heading', { name: 'Linux Administration Revised' })).toBeVisible();
      await page.getByRole('button', { name: 'Unpublish', exact: true }).click();
      await expect(editor(page).getByRole('status')).toHaveText('Course unpublished.');
      expect((await request.get('/en/courses/linux-administration')).status()).toBe(404);

      await createCourse(owner, 'nginx-basics', 'NGINX Basics', 'أساسيات إنجن إكس');
      await owner.getByRole('button', { name: 'Publish', exact: true }).click();
      await expect(editor(owner).getByRole('status')).toHaveText('Course published.');
      expect((await request.get('/en/courses/nginx-basics')).status()).toBe(200);
      owner.once('dialog', (dialog) => dialog.accept());
      await owner.getByRole('button', { name: 'Archive course' }).click();
      await expect(owner).toHaveURL(/\/en\/builder$/);
      expect((await request.get('/en/courses/nginx-basics')).status()).toBe(404);
    } finally {
      await Promise.all([owner.close(), secondInstructor.close()]);
    }
  });
});
