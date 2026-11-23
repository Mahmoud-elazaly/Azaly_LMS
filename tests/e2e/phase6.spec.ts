import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { readDatabaseUrl } from '../../src/db/env';
import { bankQuestions, courseDocument, courseId } from '../../src/features/curriculum/prometheus-grafana/course';
import { guidedCopy } from '../../src/features/guided/copy';
import { learningCopy } from '../../src/features/learning/copy';
import type { PlayerData } from '../../src/features/learning/service';
import type { Locale } from '../../src/i18n/locales';
import { createTestLearner } from './test-accounts';

const origin = 'http://127.0.0.1:3100';
const locales = ['ar', 'en'] as const;
const lessons = courseDocument.modules.flatMap((module) => module.lessons);
const quizzes = courseDocument.quizzes ?? [];
const labs = courseDocument.guidedLabs ?? [];
const draftUrl = `/api/authoring?id=${courseId}`;
const seed = (stage: 'publish' | 'draft', email: string) =>
  promisify(execFile)(process.execPath, ['scripts/seed-prometheus-grafana.mjs', stage, '--author', email]);

function post(request: APIRequestContext, url: string, data: object) {
  return request.post(url, { headers: { Origin: origin }, data });
}

async function signIn(request: APIRequestContext, credentials: { email: string; password: string }) {
  const { email, password } = credentials;
  expect((await post(request, '/api/auth/sign-in/email', { email, password })).status()).toBe(200);
}

async function identityFingerprint() {
  const pool = new Pool({ connectionString: readDatabaseUrl() });
  try {
    const { rows: [row] } = await pool.query(`
      SELECT
        (SELECT md5(coalesce(jsonb_agg(to_jsonb(u) ORDER BY id)::text, '')) FROM identity."user" u) AS users,
        (SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY id)::text, '')) FROM identity.account a) AS credentials,
        (SELECT md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY id)::text, '')) FROM identity.session s) AS sessions
    `);
    return row;
  } finally {
    await pool.end();
  }
}

async function layoutCheck(page: Page, locale: Locale, theme: string, width: number) {
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth),
    `Page overflow on ${page.url()} in ${theme} at ${width}px`).toBeLessThanOrEqual(width);
}

async function reviewLayouts(learner: Page, instructor: Page, enrollmentId: string) {
  for (const locale of locales) {
    for (const theme of ['light', 'dark']) {
      for (const page of [learner, instructor]) {
        await page.context().addCookies([{ name: 'academy-theme', value: theme, url: origin }]);
      }
      const publicDetail = `courses/${courseDocument.slug}`;
      for (const [page, route] of [
        [learner, 'courses'], [learner, publicDetail], [learner, `learning?id=${enrollmentId}`],
        [instructor, `builder?id=${courseId}`], [instructor, 'question-bank'], [instructor, 'guided-reviews'],
      ] as const) {
        await page.setViewportSize({ width: 320, height: 900 });
        expect((await page.goto(`/${locale}/${route}`))?.status()).toBe(200);
        for (const width of [320, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          await layoutCheck(page, locale, theme, width);
          if (route.startsWith('learning')) {
            const outline = page.getByRole('navigation', { name: learningCopy(locale).outline });
            const article = page.locator('#current-lesson');
            const positions = await Promise.all([outline.boundingBox(), article.boundingBox()]);
            if (!positions[0] || !positions[1]) throw new Error('The course outline and lesson must both be visible.');
            const [navigation, lesson] = positions;
            if (width === 1280) expect(locale === 'ar' ? navigation.x > lesson.x : navigation.x < lesson.x).toBe(true);
            else expect(navigation.y).toBeLessThan(lesson.y);

            for (const snippet of await page.locator('main pre').all()) {
              await expect(snippet).toHaveAttribute('dir', 'ltr');
              await expect(snippet).toHaveAttribute('translate', 'no');
              await expect(snippet).toHaveCSS('direction', 'ltr');
              await expect(snippet).toHaveCSS('overflow-x', 'auto');
            }
            if (width === 320) {
              const jump = outline.getByRole('link', { name: learningCopy(locale).jumpToLesson });
              await jump.focus();
              await jump.press('Enter');
              await expect(article).toBeFocused();
              const snippet = article.getByRole('group', { name: learningCopy(locale).codeExample }).first();
              await page.keyboard.press('Tab');
              await expect(snippet).toBeFocused();
              expect(await snippet.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
            }
          }
        }
      }
    }
  }
}

async function verifyPrivateProjection(page: Page, locale: Locale, enrollmentId: string) {
  const response = await page.request.get(`/api/learning?locale=${locale}&id=${enrollmentId}`);
  expect(response.status()).toBe(200);
  const player: PlayerData = await response.json();
  expect(player.quizzes.map(({ questions }) => questions.length)).toEqual([3, 3, 3, 3]);
  for (const [index, quiz] of player.quizzes.entries()) {
    expect(quiz.questions).toEqual(quizzes[index].questions.map((question) => ({
      id: question.id, prompt: question.translations[locale]?.prompt, choices: question.translations[locale]?.choices,
    })));
  }
  const html = await page.content();
  for (const { id, translations } of bankQuestions) {
    expect(html).not.toContain(translations[locale].explanation);
    expect(html).not.toContain(id);
  }
  return player;
}

async function gradeQuiz(page: Page, locale: Locale, quizIndex: number, answers: number[], score: number) {
  const learning = learningCopy(locale);
  const quiz = quizzes[quizIndex];
  const form = page.locator('form').filter({ has: page.getByRole('heading', { name: quiz.titles[locale], exact: true }) });
  for (const [index, question] of quiz.questions.entries()) {
    const translation = question.translations[locale];
    const field = form.getByRole('group', { name: translation?.prompt });
    await field.getByRole('radio', { name: translation?.choices[answers[index]], exact: true }).check();
  }
  const response = page.waitForResponse((entry) => entry.url() === `${origin}/api/learning` && entry.request().method() === 'POST');
  await form.getByRole('button', { name: learning.submit }).click();
  const grade = await response;
  expect(grade.status()).toBe(200);
  expect(await grade.json()).toEqual({ id: expect.any(String), score, total: 3, gradedAt: expect.any(String) });
  await expect(page.getByText(`${learning.score} ${score}/3`, { exact: true })).toBeVisible();
}

test('publishes and completes the curated path in Arabic and English', async ({ browser, page, request }) => {
  test.skip(process.env.PHASE6_TEST !== '1', 'Use the isolated Phase 6 gate.');
  test.setTimeout(240_000);
  const password = process.env.AUTH_TEST_OWNER_PASSWORD;
  if (!password) throw new Error('Missing isolated Owner credentials.');

  const staff = await browser.newPage();
  const owner = await browser.newPage();
  const other = await browser.newPage();
  const learner = await createTestLearner('Curated path learner');
  const instructor = await createTestLearner('Curated path instructor');
  const peer = await createTestLearner('Instructor from another course');
  const enroll = { operation: 'enroll', slug: courseDocument.slug, locale: 'ar' };

  try {
    await signIn(owner.request, { email: 'owner@example.test', password });
    for (const user of [instructor, peer]) {
      expect((await post(owner.request, '/api/admin/users', { operation: 'role', id: user.id, role: 'INSTRUCTOR' })).status()).toBe(200);
    }
    await signIn(staff.request, instructor);
    await signIn(page.request, learner);
    await signIn(other.request, peer);

    const identityBefore = await identityFingerprint();
    await expect(seed('publish', instructor.email)).rejects.toThrow('Stage and review');
    const draftRuns = await Promise.all([seed('draft', instructor.email), seed('draft', instructor.email)]);
    expect(draftRuns.map(({ stdout }) => stdout.trim()).sort()).toEqual([
      'Curated course draft already exists.', 'Curated course draft created.',
    ]);
    expect(await identityFingerprint()).toEqual(identityBefore);

    for (const locale of locales) {
      const title = courseDocument.translations[locale]?.title;
      expect((await request.get(`/${locale}/courses/${courseDocument.slug}`)).status()).toBe(404);
      expect(await (await request.get(`/${locale}/courses`)).text()).not.toContain(title);
    }
    expect((await post(page.request, '/api/learning', enroll)).status()).toBe(400);
    expect((await request.get(draftUrl)).status()).toBe(401);
    expect((await page.request.get(draftUrl)).status()).toBe(403);
    expect((await other.request.get(draftUrl)).status()).toBe(403);
    expect((await page.request.get('/api/question-bank')).status()).toBe(403);
    const seededDraft = await staff.request.get(draftUrl);
    expect(seededDraft.status()).toBe(200);
    const original = await seededDraft.json();
    expect(original).toMatchObject({ version: 1, visibility: 'draft', document: courseDocument });
    const bank = await staff.request.get('/api/question-bank');
    expect(bank.status()).toBe(200);
    expect((await bank.json()).map(({ id }: { id: string }) => id).sort()).toEqual(bankQuestions.map(({ id }) => id).sort());

    const privateTitle = 'Unpublished lesson edit';
    const alteredDraft = structuredClone(courseDocument);
    alteredDraft.modules[0].lessons[0].titles.en = privateTitle;
    const draftEdit = await post(staff.request, '/api/authoring', {
      operation: 'save', id: courseId, version: original.version, document: alteredDraft,
    });
    expect(draftEdit.status()).toBe(200);
    await expect(seed('publish', instructor.email)).rejects.toThrow('Existing course content differs');
    expect((await request.get(`/en/courses/${courseDocument.slug}`)).status()).toBe(404);
    expect((await post(staff.request, '/api/authoring', {
      operation: 'save', id: courseId, version: (await draftEdit.json()).version, document: courseDocument,
    })).status()).toBe(200);

    const published = await seed('publish', instructor.email);
    expect(published.stdout).toContain('published as revision 1');
    expect(await identityFingerprint()).toEqual(identityBefore);

    const liveDraft = await (await staff.request.get(draftUrl)).json();
    liveDraft.document.modules[0].lessons[0].titles.en = privateTitle;
    expect((await post(staff.request, '/api/authoring', {
      operation: 'save', id: courseId, version: liveDraft.version, document: liveDraft.document,
    })).status()).toBe(200);
    const firstBankItem = bankQuestions[0];
    const editedQuestion = {
      correct: 2, tags: firstBankItem.tags,
      translations: { ...firstBankItem.translations, en: { ...firstBankItem.translations.en, prompt: 'Unpublished bank edit' } },
    };
    expect((await post(staff.request, '/api/question-bank', {
      operation: 'save', id: firstBankItem.id, version: 1, question: editedQuestion,
    })).status()).toBe(200);
    for (const stage of ['draft', 'publish'] as const) {
      expect((await seed(stage, instructor.email)).stdout).toContain('already recorded');
    }
    expect((await (await staff.request.get(draftUrl)).json()).document.modules[0].lessons[0].titles.en).toBe(privateTitle);
    expect((await (await staff.request.get(`/api/question-bank?id=${firstBankItem.id}`)).json()).correct).toBe(2);
    expect((await post(request, '/api/auth/sign-up/email', { email: 'closed@example.test', password: randomUUID(), name: 'Closed' })).status()).toBe(404);

    await page.goto(`/ar/courses/${courseDocument.slug}`);
    await page.getByRole('button', { name: learningCopy('ar').enroll }).click();
    await expect(page).toHaveURL(/\/ar\/learning\?id=/);
    const enrollment = new URL(page.url()).searchParams.get('id');
    if (!enrollment) throw new Error('The learner enrollment did not open.');
    const lessonPath = (locale: Locale) => `/${locale}/learning?id=${enrollment}`;
    const repeated = await post(page.request, '/api/learning', { ...enroll, locale: 'en' });
    expect(repeated.status()).toBe(200);
    expect(await repeated.json()).toEqual({ id: enrollment });
    expect((await request.get(`/api/learning?locale=en&id=${enrollment}`)).status()).toBe(401);

    const selectLesson = async (locale: Locale, index: number) => {
      const title = lessons[index].titles[locale];
      const outline = page.getByRole('navigation', { name: learningCopy(locale).outline });
      await outline.getByRole('button', { name: title, exact: true }).click();
      await expect(page.locator('#current-lesson').getByRole('heading', { name: title, exact: true })).toBeVisible();
    };
    // The Compose lesson has snippets wide enough to verify keyboard scrolling on narrower viewports.
    await selectLesson('ar', 2);
    await reviewLayouts(page, staff, enrollment);

    const answerIndices = [[1, 0, 2], [2, 0, 1], [1, 0, 2], [2, 0, 1]];
    const evidence = 'Sample became pending, then firing. After restart, up returned to 1 and the alert cleared.';
    for (const [localeIndex, locale] of locales.entries()) {
      const learning = learningCopy(locale);
      const guided = guidedCopy(locale);
      await page.goto(lessonPath(locale));
      await expect(page.getByRole('heading', { level: 1, name: courseDocument.translations[locale]?.title })).toBeVisible();
      await verifyPrivateProjection(page, locale, enrollment);
      for (const [index, lesson] of lessons.entries()) {
        await selectLesson(locale, index);
        const snippets = lesson.blocks.filter((block) => block.type === 'code');
        const displayed = page.locator('#current-lesson pre');
        expect(await displayed.count()).toBe(snippets.length);
        for (const [codeIndex, snippet] of snippets.entries()) {
          await expect(displayed.nth(codeIndex)).toHaveAttribute('dir', 'ltr');
          expect(await displayed.nth(codeIndex).textContent()).toBe(snippet.translations[locale]);
        }
        const belongsToCurrentLocale = index < lessons.length / 2 ? localeIndex === 0 : localeIndex === 1;
        const article = page.locator('#current-lesson');
        if (belongsToCurrentLocale) {
          await article.getByRole('button', { name: learning.complete, exact: true }).click();
          await expect(article.getByRole('button', { name: learning.done, exact: true })).toBeDisabled();
        } else if (locale === 'en') {
          await expect(article.getByRole('button', { name: learning.done, exact: true })).toBeDisabled();
        }
      }
      await expect(page.getByRole('progressbar')).toHaveAttribute('value', locale === 'ar' ? '50' : '100');
      if (locale === 'ar') await gradeQuiz(page, locale, 0, [0, 1, 0], 0);
      for (const index of [localeIndex * 2, localeIndex * 2 + 1]) {
        await gradeQuiz(page, locale, index, answerIndices[index], 3);

        const lab = labs[index];
        const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: lab.titles[locale], exact: true }) });
        const checkpoints = card.getByRole('checkbox');
        await checkpoints.first().check();
        if (index === labs.length - 1) await card.getByLabel(guided.evidence).fill(evidence);
        if (index === 0 || index === labs.length - 1) {
          await card.getByRole('button', { name: guided.saveProgress }).click();
          await expect(card.getByText(guided.saved, { exact: true })).toBeVisible();
          await page.reload();
          await expect(checkpoints.first()).toBeChecked();
        }
        for (const checkpoint of await checkpoints.all()) await checkpoint.check();
        await card.getByRole('button', { name: guided.complete }).click();
        await expect(card.getByText(guided.selfReported, { exact: true })).toBeVisible();
      }
    }

    await page.getByRole('link', { name: 'العربية', exact: true }).click();
    await expect(page).toHaveURL(lessonPath('ar'));
    await expect(page.locator('#current-lesson').getByRole('heading', { name: lessons.at(-1)?.titles.ar, exact: true })).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveAttribute('value', '100');
    const completed = await verifyPrivateProjection(page, 'ar', enrollment);
    expect(completed.grades.map(({ score }) => score)).toEqual([3, 3, 3, 3, 0]);
    expect(completed.guidedLabs.map(({ attempt }) => attempt?.completionProvenance)).toEqual(Array(4).fill('SELF_REPORTED'));
    expect(completed.guidedLabs.map(({ attempt }) => attempt?.evidence)).toEqual(['', '', '', evidence]);
    const capstoneAttempt = completed.guidedLabs.at(-1)?.attempt;
    if (!capstoneAttempt) throw new Error('Missing recovery lab attempt.');
    const review = {
      attemptId: capstoneAttempt.id, decision: 'APPROVED', completionProvenance: 'INSTRUCTOR_REVIEWED',
      feedback: 'التسلسل الزمني ونتيجة التعافي واضحان.',
    };
    const reviewEndpoint = '/api/guided-reviews?locale=ar';
    expect((await post(other.request, reviewEndpoint, review)).status()).toBe(403);
    expect((await post(page.request, reviewEndpoint, review)).status()).toBe(403);
    expect((await post(staff.request, reviewEndpoint, { ...review, completionProvenance: 'SYSTEM_VERIFIED' })).status()).toBe(400);
    expect((await post(page.request, '/api/learning/guided-labs', {
      operation: 'complete', locale: 'ar', id: enrollment, labId: labs.at(-1)?.id,
      checkpointIds: capstoneAttempt.checkpointIds, evidence, completionProvenance: 'SYSTEM_VERIFIED',
    })).status()).toBe(400);

    await staff.goto('/ar/guided-reviews');
    const reviewCard = staff.getByRole('article').filter({ has: staff.getByRole('heading', { name: labs.at(-1)?.titles.ar, exact: true }) });
    await expect(reviewCard.getByText(evidence)).toBeVisible();
    await reviewCard.getByLabel(guidedCopy('ar').feedback).fill(review.feedback);
    await reviewCard.getByRole('button', { name: guidedCopy('ar').recordReview }).click();
    await expect(reviewCard.getByText(guidedCopy('ar').instructorReviewed, { exact: true })).toBeVisible();
    const replay = await post(staff.request, reviewEndpoint, review);
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toMatchObject({ id: capstoneAttempt.id, evidence, review: {
      completionProvenance: review.completionProvenance, decision: review.decision, feedback: review.feedback,
    } });
    expect((await post(staff.request, reviewEndpoint, { ...review, feedback: 'Changed review' })).status()).toBe(409);

    await signIn(other.request, learner);
    for (const locale of locales) {
      await other.goto(lessonPath(locale));
      const capstone = other.getByRole('article').filter({ has: other.getByRole('heading', { name: labs.at(-1)?.titles[locale], exact: true }) });
      await expect(capstone.getByText(guidedCopy(locale).selfReported, { exact: true })).toBeVisible();
      await expect(capstone.getByText(guidedCopy(locale).instructorReviewed, { exact: true })).toBeVisible();
      await expect(capstone.getByText(evidence)).toBeVisible();
      await expect(capstone.getByText(review.feedback)).toBeVisible();
    }
  } finally {
    await Promise.all([staff.close(), owner.close(), other.close()]);
  }
});
