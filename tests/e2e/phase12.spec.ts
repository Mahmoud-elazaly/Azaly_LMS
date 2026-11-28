import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { readDatabaseUrl } from '../../src/db/env';
import { masteryCopy } from '../../src/features/mastery/copy';
import type { MasterySnapshot } from '../../src/features/mastery/model';
import { labTemplates, realLabHref, type LabTemplateVersion } from '../../src/features/real-lab/catalog';
import { realLabCopy } from '../../src/features/real-lab/copy';
import type { LabAttempt } from '../../src/features/real-lab/policy';
import { copy as interfaceCopy } from '../../src/i18n/messages';
import { createTestLearner } from './test-accounts';
import { themeCases } from './theme-cases';

const path = '/api/real-lab';
const origin = 'http://127.0.0.1:3100';
const sizes = [{ width: 390, height: 844 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }];
const scenarios = [
  { version: 'linux-file-permissions@1', slug: 'linux-file-permissions', starter: 'umask 022', target: 'umask 077',
    initial: 'mode=644 owner=101', result: 'mode=600 owner=101' },
  { version: 'prometheus-exposition@1', slug: 'prometheus-exposition', starter: 'environment=staging', target: 'environment=production',
    initial: 'checkout_requests_total{environment="staging"} 7', result: 'checkout_requests_total{environment="production"} 7' },
] as const;

function post(request: APIRequestContext, url: string, data: object) {
  return request.post(url, { headers: { Origin: origin }, data });
}

async function attempt(request: APIRequestContext) {
  const response = await request.get(path);
  expect(response.status()).toBe(200);
  return await response.json() as LabAttempt;
}

async function mastery(request: APIRequestContext) {
  const response = await request.get('/api/mastery?locale=en');
  expect(response.status()).toBe(200);
  return await response.json() as MasterySnapshot;
}

async function checkWorkspaceLayouts(page: Page, scenario: typeof scenarios[number]) {
  for (const locale of ['ar', 'en'] as const) {
    const labels = realLabCopy(locale, scenario.version);
    await page.goto(realLabHref(locale, scenario.version));
    const editor = page.getByRole('textbox', { name: labels.directive });
    await expect(editor).toHaveValue(scenario.starter);
    await page.getByRole('button', { name: labels.preview }).click();
    const output = page.getByRole('group', { name: labels.proxy });
    await expect(output).toContainText(scenario.initial);
    for (const { theme, colorScheme } of themeCases) {
      await page.emulateMedia({ colorScheme });
      await page.getByRole('button', { name: interfaceCopy(locale)(theme), exact: true }).click();
      for (const size of sizes) {
        await page.setViewportSize(size);
        const root = page.locator('html');
        await expect(root).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
        await expect(root).toHaveCSS('color-scheme', colorScheme);
        await expect(editor).toHaveAttribute('dir', 'ltr');
        await expect(output).toHaveCSS('direction', 'ltr');
        expect(await root.evaluate((node) => node.scrollWidth), `${locale} ${theme} ${size.width}`).toBeLessThanOrEqual(size.width);
      }
    }
    await editor.focus();
    await expect(editor).toBeFocused();
  }
}

async function assertPrivateOutcome(page: Page, other: APIRequestContext, slug: string, version: LabTemplateVersion) {
  const owner = await mastery(page.request);
  expect(owner.concepts.find((concept) => concept.slug === slug)).toMatchObject({
    score: 100, status: 'mastered', items: [{ kind: 'real', id: version, provenance: 'SYSTEM_VERIFIED' }],
  });
  expect(owner.weakest.some((concept) => concept.slug === slug)).toBe(false);
  const outsider = await mastery(other);
  expect(outsider.concepts.find((concept) => concept.slug === slug)).toMatchObject({ score: 0, status: 'notStarted' });
  expect(outsider.weakest.some((concept) => concept.slug === slug)).toBe(true);
}

for (const scenario of scenarios) {
  test(`grades and isolates ${scenario.slug} in the live workspace and mastery queue`, async ({ page, browser }) => {
    test.skip(process.env.PHASE12_TEST !== '1', 'Use the isolated Phase 12 gate.');
    test.setTimeout(120_000);
    const [learner, outsider] = await Promise.all([createTestLearner('Real Lab learner'), createTestLearner('Other lab learner')]);
    const other = await browser.newPage();
    const db = new Pool({ connectionString: readDatabaseUrl() });
    const { version, slug, starter, target, result } = scenario;
    const labels = realLabCopy('en', version);
    try {
      for (const [request, { email, password }] of [[page.request, learner], [other.request, outsider]] as const) {
        expect((await post(request, '/api/auth/sign-in/email', { email, password })).status()).toBe(200);
      }
      await page.goto('/en/learning');
      await expect(page.getByRole('navigation', { name: labels.catalog }).getByRole('link', { name: labels.title }))
        .toHaveAttribute('href', realLabHref('en', version));
      await page.goto('/en/mastery');
      const queue = page.getByRole('region', { name: masteryCopy('en').weakest });
      await queue.getByRole('link', { name: labels.title, exact: true }).click();
      await expect(page.getByRole('navigation', { name: labels.catalog })).toBeVisible();
      await expect(page.getByRole('link', { name: 'العربية', exact: true })).toHaveAttribute('href', realLabHref('ar', version));
      await expect(page.getByRole('heading', { name: labels.title, level: 1 })).toBeVisible();
      await page.getByRole('button', { name: labels.start }).click();
      const field = page.getByRole('textbox', { name: labels.directive });
      await expect(field).toHaveValue(starter);
      const { id, templateVersion } = await attempt(page.request);
      expect(templateVersion).toBe(version);
      expect((await post(page.request, path, { operation: 'start', requestId: randomUUID(), templateVersion: 'nginx-reverse-proxy@1' })).status()).toBe(409);
      expect(await (await other.request.get(path)).json()).toBeNull();
      for (const input of [{ operation: 'preview', id }, { operation: 'apply', id, configuration: target },
        { operation: 'validate', id }, { operation: 'stop', id }]) {
        expect((await post(other.request, path, input)).status()).toBe(403);
      }
      expect((await post(page.request, path, { operation: 'apply', id, configuration: 'proxy_pass http://127.0.0.1:8081;' })).status()).toBe(400);

      await page.getByRole('button', { name: labels.check }).click();
      await expect(page.getByText(labels.wrongResponse, { exact: true })).toBeVisible();
      expect((await attempt(page.request)).check).toMatchObject({ completionProvenance: null });
      expect((await mastery(page.request)).weakest.some((entry) => entry.slug === slug)).toBe(true);

      await checkWorkspaceLayouts(page, scenario);
      await field.fill(target);
      await page.getByRole('button', { name: labels.apply }).click();
      await expect(page.getByText(labels.applied, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: labels.preview }).click();
      await expect(page.getByRole('group', { name: labels.proxy })).toContainText(result);
      await page.getByRole('button', { name: labels.check }).click();
      await expect(page.getByText(labels.verified, { exact: true })).toBeVisible();
      expect((await attempt(page.request)).check).toMatchObject({
        configurationOk: true, responseOk: true, completionProvenance: 'SYSTEM_VERIFIED',
      });
      expect((await post(page.request, path, { operation: 'apply', id, configuration: starter })).status()).toBe(409);

      if (version === 'linux-file-permissions@1') {
        page.once('dialog', (dialog) => void dialog.accept());
        await page.getByRole('button', { name: labels.stop }).click();
      } else {
        await db.query('UPDATE real_lab.attempts SET expires_at=clock_timestamp() WHERE id=$1', [id]);
        await expect(page.getByText(labels.reasons.EXPIRED, { exact: true })).toBeVisible();
      }
      await expect(page.getByText(labels.states.DESTROYED, { exact: true })).toBeVisible();
      await expect(page.getByText(labels.verified, { exact: true })).toBeVisible();
      const { rows } = await db.query('SELECT checker_version FROM real_lab.checks WHERE attempt_id=$1 ORDER BY checked_at', [id]);
      expect(rows).toEqual(Array.from({ length: 2 }, () => ({ checker_version: labTemplates[version].checkerVersion })));
      await assertPrivateOutcome(page, other.request, slug, version);
      await page.goto('/en/mastery');
      await expect(queue.getByRole('link', { name: labels.title, exact: true })).toHaveCount(0);
    } finally {
      await Promise.all([other.close(), db.end()]);
    }
  });
}
