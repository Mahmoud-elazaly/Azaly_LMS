import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { Pool } from 'pg';
import { readDatabaseUrl } from '../../src/db/env';

test('English and Arabic navigation sets document direction and preserves LTR code', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page).toHaveURL(/\/ar$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.goto('/en/about');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.getByRole('link', { name: 'العربية' }).click();
  await expect(page).toHaveURL(/\/ar\/about$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('pre')).toHaveCSS('direction', 'ltr');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  expect(pageErrors).toEqual([]);
});

test('theme selection survives navigation and reload', async ({ page }) => {
  await page.goto('/en');
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
});

test('health and readiness reflect a migrated service', async ({ request }) => {
  expect(await (await request.get('/api/health')).json()).toEqual({ status: 'ok' });
  expect(await (await request.get('/api/ready')).json()).toEqual({ status: 'ready' });
});

test('an empty test database exposes an empty catalog and missing details', async ({ page }) => {
  await page.goto('/en/courses');
  await expect(page.getByText('No courses have been published in English yet.')).toBeVisible();
  expect((await page.goto('/en/courses/nonexistent'))?.status()).toBe(404);
});

test('only the latest published revision and matching translations are public', async ({ page }) => {
  const pool = new Pool({ connectionString: readDatabaseUrl() });
  const slug = `smoke-${randomUUID()}`;
  const courseId = randomUUID();
  const publishedId = randomUUID();
  const draftId = randomUUID();

  try {
    await pool.query('insert into courses (id, slug) values ($1, $2)', [courseId, slug]);
    await pool.query(
      'insert into course_versions (id, course_id, revision, published_at) values ($1, $3, 1, now()), ($2, $3, 2, null)',
      [publishedId, draftId, courseId],
    );
    await pool.query(
      "insert into course_translations values ($1, 'en', 'Linux smoke course', 'English summary'), ($1, 'ar', 'دورة لينكس', 'ملخص عربي'), ($2, 'en', 'Hidden draft', 'Draft summary')",
      [publishedId, draftId],
    );

    await page.goto('/en/courses');
    await expect(page.getByText('Hidden draft')).toHaveCount(0);
    await page.getByRole('link', { name: 'Linux smoke course' }).click();
    await expect(page.getByRole('heading', { name: 'Linux smoke course' })).toBeVisible();
    await page.getByRole('link', { name: 'العربية' }).click();
    await expect(page.getByRole('heading', { name: 'دورة لينكس' })).toBeVisible();
  } finally {
    try {
      await pool.query('delete from course_translations where version_id in ($1, $2)', [publishedId, draftId]);
      await pool.query('delete from course_versions where course_id = $1', [courseId]);
      await pool.query('delete from courses where id = $1', [courseId]);
    } finally {
      await pool.end();
    }
  }
});
