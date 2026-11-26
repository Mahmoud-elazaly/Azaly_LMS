import { applyTheme, themeCases } from './theme-cases';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { readDatabaseUrl } from '../../src/db/env';
import { assessmentCopy } from '../../src/features/assessment/copy';
import { builderCopy } from '../../src/features/authoring/copy';
import type { CourseDraft } from '../../src/features/authoring/policy';
import { learningCopy } from '../../src/features/learning/copy';
import type { PlayerData } from '../../src/features/learning/service';
import type { Locale } from '../../src/i18n/locales';
import { archiveEntries, courseZip, fixtureSlug } from '../fixtures/phase8-archive';
import { createTestLearner } from './test-accounts';

const origin = 'http://127.0.0.1:3100';
test.use({ actionTimeout: 10_000, navigationTimeout: 15_000 });
const enBank = assessmentCopy('en');
const bankPrompts = {
  en: { bug: 'Find the bank configuration issue', cli: 'Recall the bank command' },
  ar: { bug: 'اكتشف خطأ الإعداد في البنك', cli: 'استدعِ أمر البنك' },
};

function post(request: APIRequestContext, path: string, data: object) {
  return request.post(path, { headers: { Origin: origin }, data });
}

async function signIn(request: APIRequestContext, email: string, password: string) {
  expect((await post(request, '/api/auth/sign-in/email', { email, password })).status()).toBe(200);
}

async function runImport(path: string, mode: '--apply' | '--dry-run', token?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, COURSE_IMPORT_SESSION_TOKEN: token ?? '' };
  if (mode === '--dry-run') env.AUTHORING_DATABASE_URL = '';
  const { stdout } = await promisify(execFile)(process.execPath, ['scripts/import-course.ts', mode, path], { env });
  return JSON.parse(stdout);
}

async function addBankQuestion(page: Page, type: 'find_bug' | 'cli_recall') {
  await page.getByRole('button', { name: enBank.create }).click();
  await page.getByRole('combobox', { name: enBank.type, exact: true }).selectOption(type);
  for (const locale of ['ar', 'en'] as const) {
    await page.locator(`input[name="${locale}-prompt"]`).fill(bankPrompts[locale][type === 'find_bug' ? 'bug' : 'cli']);
    await page.locator(`textarea[name="${locale}-explanation"]`).fill(locale === 'ar' ? 'شرح خاص' : 'Private bank notes');
  }
  if (type === 'find_bug') {
    await page.getByLabel(enBank.language).selectOption('nginx');
    await page.getByLabel(enBank.snippet).fill('server {\n  listen invalid;\n}');
    await page.getByLabel(enBank.faultyLines).fill('2');
  } else {
    await page.getByLabel(enBank.rule).selectOption('regex');
    await page.getByLabel(enBank.expected).fill('workspace inspect (main|head)');
  }
  await page.getByRole('button', { name: enBank.save }).click();
  await expect(page.getByRole('status')).toHaveText(enBank.saved);
}

const diagrams = {
  en: { title: 'Lesson diagram', fallback: 'This diagram could not be rendered.', zoom: 'Zoom in', reset: 'Reset view' },
  ar: { title: 'مخطط الدرس', fallback: 'تعذر عرض هذا المخطط.', zoom: 'تكبير', reset: 'إعادة ضبط العرض' },
};

async function noPageOverflow(page: Page, locale: Locale, theme: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

async function reviewLayouts(author: Page, learner: Page, draft: string, enrollment: string) {
  for (const locale of ['ar', 'en'] as const) {
    const copy = diagrams[locale];
    for (const themeCase of themeCases) {
      const { colorScheme } = themeCase;
      for (const page of [author, learner]) {
        await applyTheme(page, themeCase);
        await page.setViewportSize({ width: 320, height: 900 });
      }
      await author.goto(`/${locale}/question-bank`);
      await author.getByRole('button', { name: bankPrompts[locale].bug }).click();
      await expect(author.getByLabel(assessmentCopy(locale).snippet)).toHaveCSS('direction', 'ltr');
      await noPageOverflow(author, locale, colorScheme, 320);
      await noPageOverflow(author, locale, colorScheme, 1280);
      await author.getByRole('button', { name: bankPrompts[locale].cli }).click();
      await expect(author.getByLabel(assessmentCopy(locale).expected)).toHaveCSS('direction', 'ltr');

      await author.setViewportSize({ width: 320, height: 900 });
      await author.goto(`/${locale}/builder?id=${draft}`);
      await author.getByText(builderCopy(locale).preview, { exact: true }).click();
      await expect(author.getByRole('img', { name: copy.title })).toBeVisible();
      await noPageOverflow(author, locale, colorScheme, 320);
      await noPageOverflow(author, locale, colorScheme, 1280);

      await learner.goto(`/${locale}/learning?id=${enrollment}`);
      const image = learner.getByRole('img', { name: copy.title });
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await expect(learner.getByText(copy.fallback)).toBeVisible();
      await expect(learner.getByText('this cannot parse as a diagram', { exact: true })).toBeVisible();
      const canvas = image.locator('..');
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect(learner.locator('main .snippet-lines')).toHaveCSS('direction', 'ltr');
      await expect(learner.getByLabel(assessmentCopy(locale).command)).toHaveCSS('direction', 'ltr');
      await noPageOverflow(learner, locale, colorScheme, 320);
      await learner.getByRole('button', { name: copy.zoom }).click();
      await expect(image).toHaveAttribute('style', /125%/);
      await canvas.focus();
      await canvas.press('ArrowRight');
      await expect.poll(() => canvas.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      await learner.getByRole('button', { name: copy.reset }).click();
      await expect(image).toHaveAttribute('style', /100%/);
      await noPageOverflow(learner, locale, colorScheme, 1280);
    }
  }
}

test('imports private drafts, preserves published lessons and grades both new assessment types', async ({ page, browser, request }) => {
  test.skip(process.env.PHASE8_TEST !== '1', 'Use the isolated Phase 8 gate.');
  test.setTimeout(240_000);
  const ownerPassword = process.env.AUTH_TEST_OWNER_PASSWORD;
  if (!ownerPassword) throw new Error('Missing isolated Owner');
  const directory = await mkdtemp(join(tmpdir(), 'p8-browser-'));
  const path = join(directory, 'course.zip');
  const author = await browser.newPage();
  const pool = new Pool({ connectionString: readDatabaseUrl() });
  try {
    await writeFile(path, courseZip(archiveEntries()));
    const dryRun = await runImport(path, '--dry-run');
    expect(dryRun).toMatchObject({ status: 'validated', slug: fixtureSlug, lessons: 1, quizzes: 1 });
    expect(dryRun.warnings.map(({ code }: { code: string }) => code).sort()).toEqual([
      'ignored_binary', 'ignored_path', 'ignored_path', 'ignored_path', 'ignored_path', 'unmapped_file', 'unmatched_quiz_pair',
    ]);
    const { rows: [dryRunCount] } = await pool.query('SELECT count(*)::int AS count FROM courses WHERE slug=$1', [fixtureSlug]);
    expect(dryRunCount.count).toBe(0);
    expect((await request.post('/api/auth/sign-up/email', { data: {} })).status()).toBe(404);

    await signIn(author.request, 'owner@example.test', ownerPassword);
    const { rows: [session] } = await pool.query<{ token: string }>(`SELECT s.token FROM identity.session s JOIN identity."user" u
      ON u.id = s.user_id WHERE u.email='owner@example.test' ORDER BY s.created_at DESC LIMIT 1`);
    const imported = await runImport(path, '--apply', session.token);
    expect(imported).toMatchObject({ status: 'created', version: 1 });
    expect(await runImport(path, '--apply', session.token)).toMatchObject({ status: 'unchanged', id: imported.id, version: 1 });
    for (const locale of ['en', 'ar']) {
      expect((await request.get(`/${locale}/courses/${fixtureSlug}`)).status()).toBe(404);
    }

    const learner = await createTestLearner('Phase 8 learner');
    await signIn(page.request, learner.email, learner.password);
    expect((await post(page.request, '/api/learning', { operation: 'enroll', locale: 'en', slug: fixtureSlug })).status()).toBe(400);
    await author.goto(`/en/builder?id=${imported.id}`);
    await author.getByRole('button', { name: builderCopy('en').publish, exact: true }).click();
    await expect(author.getByRole('status')).toHaveText(builderCopy('en').coursePublished);

    await writeFile(path, courseZip(archiveEntries('Private draft update')));
    expect(await runImport(path, '--apply', session.token)).toMatchObject({ status: 'updated', id: imported.id, version: 3 });
    const enrollmentRequest = await post(page.request, '/api/learning', { operation: 'enroll', locale: 'en', slug: fixtureSlug });
    expect(enrollmentRequest.status()).toBe(200);
    const enrollment: { id: string } = await enrollmentRequest.json();

    await author.goto('/en/question-bank');
    await addBankQuestion(author, 'find_bug');
    await addBankQuestion(author, 'cli_recall');
    await author.goto(`/en/builder?id=${imported.id}`);
    for (const prompt of [bankPrompts.en.bug, bankPrompts.en.cli]) {
      await author.getByLabel(enBank.choose).selectOption({ label: prompt });
      await author.getByRole('button', { name: enBank.import, exact: true }).click();
    }
    await author.getByRole('button', { name: builderCopy('en').save, exact: true }).click();
    await expect(author.getByRole('status')).toHaveText(builderCopy('en').saved);
    const draft: CourseDraft = await (await author.request.get(`/api/authoring?id=${imported.id}`)).json();
    expect(draft.document.quizzes?.[0].questions.map(({ type }) => type)).toEqual(['find_bug', 'cli_recall', 'find_bug', 'cli_recall']);
    await expect(runImport(path, '--apply', session.token)).rejects.toMatchObject({ stderr: expect.stringContaining('draft_conflict') });

    await reviewLayouts(author, page, imported.id, enrollment.id);
    await page.goto(`/en/learning?id=${enrollment.id}`);
    await expect(page.getByText('Published lesson text')).toBeVisible();
    await expect(page.getByText('Private draft update')).toHaveCount(0);
    const response = await page.request.get(`/api/learning?locale=en&id=${enrollment.id}`);
    const player: PlayerData = await response.json();
    const [quiz] = player.quizzes;
    expect(quiz.questions).toEqual([
      { id: expect.any(String), type: 'find_bug', prompt: 'Which configuration lines need repair?', language: 'yaml', snippet: 'version: 1\ncolour: blu\nport: -1' },
      { id: expect.any(String), type: 'cli_recall', prompt: 'Recall the workspace check.' },
    ]);
    for (const privateValue of ['PRIVATE BUG EXPLANATION', 'PRIVATE CLI EXPLANATION', 'faultyLines', 'target=sample', 'bankSource']) {
      expect(JSON.stringify(player)).not.toContain(privateValue);
      expect(await page.content()).not.toContain(privateValue);
    }

    const submit = { operation: 'submit', locale: 'en', id: enrollment.id, quizId: quiz.id, attemptId: randomUUID(),
      answers: { [quiz.questions[0].id]: [2], [quiz.questions[1].id]: 'workspace check --target=sample --slow' } };
    expect((await post(page.request, '/api/learning', { ...submit, score: 2 })).status()).toBe(400);
    const failed = await post(page.request, '/api/learning', submit);
    expect(failed.status()).toBe(200);
    expect(await failed.json()).toMatchObject({ score: 0, total: 2 });

    await page.getByRole('checkbox', { name: /^Line 2:/ }).check();
    await page.getByRole('checkbox', { name: /^Line 3:/ }).check();
    await page.getByLabel(enBank.command).fill('  workspace   check --fast --target=sample  ');
    const gradingResponse = page.waitForResponse((entry) => entry.url() === `${origin}/api/learning` && entry.request().method() === 'POST');
    await page.getByRole('button', { name: learningCopy('en').submit }).click();
    const passed = await gradingResponse;
    expect(passed.status()).toBe(200);
    expect(await passed.json()).toEqual({ id: expect.any(String), score: 2, total: 2, gradedAt: expect.any(String) });
    await expect(page.getByText('2/2', { exact: true }).first()).toBeVisible();
  } finally {
    await Promise.all([author.close(), pool.end(), rm(directory, { recursive: true, force: true })]);
  }
});
