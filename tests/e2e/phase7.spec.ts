import { themeCases } from './theme-cases';
import { copy as interfaceCopy } from '../../src/i18n/messages';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { readDatabaseUrl } from '../../src/db/env';
import { realLabCopy } from '../../src/features/real-lab/copy';
import { starterDirective, type LabAttempt } from '../../src/features/real-lab/policy';
import { createTestLearner } from './test-accounts';

const origin = 'http://127.0.0.1:3100';
const path = '/api/real-lab';

function post(request: APIRequestContext, url: string, data: object) {
  return request.post(url, { headers: { Origin: origin }, data });
}

async function signIn(request: APIRequestContext, credentials: { email: string; password: string }) {
  const { email, password } = credentials;
  expect((await post(request, '/api/auth/sign-in/email', { email, password })).status()).toBe(200);
}

async function currentAttempt(page: Page): Promise<LabAttempt> {
  const response = await page.request.get(path);
  expect(response.status()).toBe(200);
  return response.json();
}

async function layoutMatrix(page: Page) {
  for (const locale of ['ar', 'en'] as const) {
    const copy = realLabCopy(locale);
    await page.goto(`/${locale}/real-lab`);
    for (const { theme, colorScheme } of themeCases) {
      await page.emulateMedia({ colorScheme });
      await page.getByRole('button', { name: interfaceCopy(locale)(theme), exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.title);
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      await expect(page.locator('html')).toHaveCSS('color-scheme', colorScheme);
      for (const width of [320, 1280]) {
        await page.setViewportSize({ width, height: 850 });
        const editor = page.getByRole('textbox', { name: copy.directive });
        await expect(editor).toHaveAttribute('dir', 'ltr');
        await expect(editor).toHaveCSS('direction', 'ltr');
        await editor.focus();
        await expect(editor).toBeFocused();
        await expect(editor).toHaveCSS('outline-style', 'solid');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        if (width === 1280) {
          const left = await page.getByRole('heading', { name: copy.editor }).boundingBox();
          const right = await page.getByRole('heading', { name: copy.proxy }).boundingBox();
          if (!left || !right) throw new Error('Missing lab workspace columns');
          expect(locale === 'ar' ? left.x > right.x : left.x < right.x).toBe(true);
        }
      }
      await page.getByRole('button', { name: copy.preview }).click();
      const output = page.getByRole('group', { name: copy.proxy });
      await expect(output).toHaveText('upstream-green');
      await expect(output).toHaveCSS('direction', 'ltr');
      await output.focus();
      await expect(output).toBeFocused();
    }
  }
}

test('isolates the live NGINX workspace and grades, stops, resets and expires it', async ({ page, browser, request }) => {
  test.skip(process.env.PHASE7_TEST !== '1', 'Use the isolated Phase 7 gate.');
  test.setTimeout(180_000);
  const learner = await createTestLearner('NGINX learner');
  const outsider = await createTestLearner('Another learner');
  const other = await browser.newPage();
  const secondSession = await browser.newPage();
  const db = new Pool({ connectionString: readDatabaseUrl() });
  const en = realLabCopy('en');
  const ar = realLabCopy('ar');
  try {
    expect((await request.get(path)).status()).toBe(401);
    expect((await post(request, path, { operation: 'start', requestId: randomUUID() })).status()).toBe(401);
    await signIn(page.request, learner);
    await signIn(other.request, outsider);
    await signIn(secondSession.request, learner);
    expect((await page.request.post(path, {
      headers: { Origin: 'https://untrusted.example.test' }, data: { operation: 'start', requestId: randomUUID() },
    })).status()).toBe(403);

    await page.goto('/en/learning');
    await page.getByRole('link', { name: en.title }).click();
    await page.getByRole('button', { name: en.start, exact: true }).click();
    await expect(page.getByRole('textbox', { name: en.directive })).toHaveValue(starterDirective);
    const { id } = await currentAttempt(page);
    const attempt = { id };
    expect((await post(secondSession.request, path, { operation: 'start', requestId: randomUUID() })).status()).toBe(409);
    for (const actor of [other.request, secondSession.request]) {
      expect(await (await actor.get(path)).json()).toBeNull();
      for (const operation of ['preview', 'config', 'validate', 'reset', 'stop']) {
        expect((await post(actor, path, { operation, ...attempt })).status()).toBe(403);
      }
      expect((await post(actor, path, { operation: 'apply', ...attempt, configuration: starterDirective })).status()).toBe(403);
    }
    for (const mutation of [
      { operation: 'validate', ...attempt, completionProvenance: 'SYSTEM_VERIFIED', passed: true },
      { operation: 'preview', ...attempt, url: 'http://postgres:5432/' },
      { operation: 'apply', ...attempt, configuration: 'proxy_pass http://postgres:5432;' },
    ]) {
      expect((await post(page.request, path, mutation)).status()).toBe(400);
    }

    await page.getByRole('button', { name: en.preview }).click();
    await expect(page.getByText('upstream-green', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: en.check }).click();
    await expect(page.getByText(en.wrongResponse, { exact: true })).toBeVisible();
    expect((await currentAttempt(page)).check?.completionProvenance).toBeNull();

    await layoutMatrix(page);
    await page.getByRole('link', { name: 'العربية', exact: true }).click();
    const field = page.getByRole('textbox', { name: ar.directive });
    await expect(field).toBeEditable();
    await field.fill('proxy_pass http://127.0.0.1:8081;');
    await page.getByRole('button', { name: ar.apply }).click();
    await expect(page.getByText(ar.applied, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: ar.preview }).click();
    await expect(page.getByText('upstream-blue', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: ar.check }).click();
    await expect(page.getByText(ar.verified, { exact: true })).toBeVisible();
    expect((await currentAttempt(page)).check).toMatchObject({
      completionProvenance: 'SYSTEM_VERIFIED', configurationOk: true, responseOk: true,
    });
    expect((await post(page.request, path, { operation: 'apply', ...attempt, configuration: starterDirective })).status()).toBe(409);

    await page.reload();
    await expect(page.getByText(ar.verified, { exact: true })).toBeVisible();
    await expect(field).toHaveValue('proxy_pass http://127.0.0.1:8081;');
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: ar.stop }).click();
    await expect(page.getByText(ar.states.DESTROYED, { exact: true })).toBeVisible();
    await expect(page.getByText(ar.verified, { exact: true })).toBeVisible();
    expect((await post(page.request, path, { operation: 'preview', ...attempt })).status()).toBe(409);

    await page.getByRole('button', { name: ar.start }).click();
    await expect(field).toHaveValue(starterDirective);
    expect((await currentAttempt(page)).id).not.toBe(id);
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: ar.reset }).click();
    await expect(page.getByText(ar.reasons.RESET, { exact: true })).toBeVisible();
    await expect(page.getByText(ar.states.DESTROYED, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: ar.start }).click();
    await expect(field).toHaveValue(starterDirective);
    const expiredId = (await currentAttempt(page)).id;
    await db.query('UPDATE real_lab.attempts SET expires_at=clock_timestamp() WHERE id=$1', [expiredId]);
    await expect(page.getByText(ar.reasons.EXPIRED, { exact: true })).toBeVisible();
    await expect(page.getByText(ar.states.DESTROYED, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: ar.start }).click();
    await expect(field).toHaveValue(starterDirective);
    const cancelledId = (await currentAttempt(page)).id;
    expect((await post(page.request, '/api/auth/sign-out', {})).status()).toBe(200);
    await expect.poll(async () => {
      const { rows } = await db.query('SELECT state, end_reason FROM real_lab.attempts WHERE id=$1', [cancelledId]);
      return rows[0];
    }).toEqual({ state: 'DESTROYED', end_reason: 'CANCELLED' });
  } finally {
    await Promise.all([other.close(), secondSession.close(), db.end()]);
  }
});
