import { applyTheme, themeCases } from './theme-cases';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { capturedInvitation, createTestLearner } from './test-accounts';

const origin = 'http://127.0.0.1:3100';
const ownerPassword = process.env.AUTH_TEST_OWNER_PASSWORD;
const slug = `guided-${randomUUID()}`;
const questionPrompt = 'Which file stores settings?';
const labTitle = 'Inspect a configuration';
const arabicLabTitle = 'فحص ملف إعدادات';
const longCommand = `cat practice/${'configuration-'.repeat(22)}.txt`;

function post(request: APIRequestContext, url: string, data: object) {
  return request.post(url, { headers: { Origin: origin }, data });
}

async function signIn(request: APIRequestContext, credentials: { email: string; password: string }) {
  expect((await post(request, '/api/auth/sign-in/email', credentials)).status()).toBe(200);
}

async function inviteInstructor(owner: APIRequestContext, anonymous: APIRequestContext) {
  const email = `instructor-${randomUUID()}@example.test`;
  const password = randomUUID();
  expect((await post(owner, '/api/admin/users', {
    operation: 'invite', name: 'Phase 5 instructor', email, role: 'INSTRUCTOR', locale: 'en',
  })).status()).toBe(200);
  const link = await capturedInvitation(email);
  expect(link.pathname).toBe('/en/activate');
  expect((await post(anonymous, '/api/auth/activate', { token: link.hash.slice(1), password })).status()).toBe(200);
  return { email, password };
}

async function createQuestion(page: Page) {
  await page.goto('/en/question-bank');
  const english = page.getByRole('group', { name: 'English', exact: true });
  const arabic = page.getByRole('group', { name: 'العربية', exact: true });
  await english.getByLabel('Question prompt').fill(questionPrompt);
  await english.getByLabel('Choice 1', { exact: true }).fill('Config file');
  await english.getByLabel('Choice 2', { exact: true }).fill('Image file');
  await english.getByLabel('Answer explanation').fill('Configuration is stored in a settings file.');
  await arabic.getByLabel('نص السؤال').fill('أي ملف يحفظ الإعدادات؟');
  await arabic.getByLabel('الخيار 1', { exact: true }).fill('ملف الإعدادات');
  await arabic.getByLabel('الخيار 2', { exact: true }).fill('ملف الصورة');
  await arabic.getByLabel('شرح الإجابة').fill('تُحفظ الإعدادات في ملف الإعدادات.');
  await page.getByLabel('Tags (comma-separated)').fill('configuration, practice');
  await page.getByRole('button', { name: 'Save question' }).click();
  await expect(page.getByRole('status')).toHaveText('Question saved.');
  const listing = await page.request.get('/api/question-bank');
  expect(listing.status()).toBe(200);
  const questions: { id: string }[] = await listing.json();
  expect(questions).toHaveLength(1);
  return questions[0].id;
}

async function createBaseDraft(request: APIRequestContext) {
  const created = await post(request, '/api/authoring', { operation: 'create', slug });
  expect(created.status()).toBe(200);
  const { id }: { id: string } = await created.json();
  expect((await post(request, '/api/authoring', { operation: 'save', id, version: 1, document: {
    slug, position: 0, translations: {
      en: { title: 'Guided configuration practice', summary: 'Inspect configuration files.' },
      ar: { title: 'تدريب موجّه على الإعدادات', summary: 'افحص ملفات الإعدادات.' },
    },
    modules: [{ id: randomUUID(), titles: { en: 'Files', ar: 'الملفات' }, lessons: [{
      id: randomUUID(), titles: { en: 'Configuration', ar: 'الإعدادات' }, blocks: [{
        id: randomUUID(), type: 'paragraph', translations: { en: 'Read the file.', ar: 'اقرأ الملف.' },
      }],
    }] }],
  } })).status()).toBe(200);
  return id;
}

async function publishPractice(page: Page, id: string, questionId: string) {
  await page.goto(`/en/builder?id=${id}`);
  await page.getByRole('button', { name: 'Add quiz' }).click();
  await page.getByLabel('Quiz title').fill('Configuration check');
  await page.getByLabel('Choose a bank question').selectOption(questionId);
  await page.getByRole('button', { name: 'Import question' }).click();
  await expect(page.getByLabel('Question', { exact: true })).toHaveValue(questionPrompt);
  await page.getByRole('button', { name: 'Add Guided Lab' }).click();
  await page.getByLabel('Lab title').fill(labTitle);
  await page.getByLabel('Instructions').fill('Inspect the example file and record the value.');
  await page.getByLabel('Commands', { exact: true }).fill(longCommand);
  await page.getByLabel('Starter snippet').fill('enabled=true');
  await page.getByLabel('Evidence prompt (optional)').fill('Paste the result from your practice environment.');
  await page.getByRole('button', { name: 'Add checkpoint' }).click();
  await page.getByRole('button', { name: 'Add checkpoint' }).click();
  await page.getByLabel('Checkpoint 1').fill('Open the file');
  await page.getByLabel('Checkpoint 2').fill('Record the value');
  await page.getByLabel('Content language').selectOption('ar');
  await page.getByLabel('Quiz title').fill('اختبار الإعدادات');
  await page.getByLabel('Lab title').fill(arabicLabTitle);
  await page.getByLabel('Instructions').fill('افحص الملف التدريبي وسجّل القيمة.');
  await page.getByLabel('Evidence prompt (optional)').fill('ألصق نتيجة التدريب.');
  await page.getByLabel('Checkpoint 1').fill('افتح الملف');
  await page.getByLabel('Checkpoint 2').fill('سجّل القيمة');
  await expect(page.getByLabel('Commands', { exact: true })).toHaveAttribute('dir', 'ltr');
  await expect(page.getByLabel('Starter snippet')).toHaveAttribute('dir', 'ltr');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status')).toHaveText('Draft saved.');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Course published.');
}

async function changeBankAfterPublication(page: Page) {
  await page.goto('/en/question-bank');
  await page.getByRole('button', { name: questionPrompt, exact: true }).click();
  await page.getByRole('group', { name: 'English', exact: true }).getByLabel('Question prompt').fill('Edited private bank item');
  await page.getByLabel('Correct choice').selectOption('1');
  await page.getByRole('button', { name: 'Save question' }).click();
  await expect(page.getByRole('status')).toHaveText('Question saved.');
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Archive question' }).click();
  await expect(page.getByRole('status')).toHaveText('Archived questions stay in existing course copies.');
}

async function verifyLabViewport(page: Page, locale: 'ar' | 'en') {
  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    for (const code of await page.locator('.guided-code').all()) {
      await expect(code).toHaveAttribute('dir', 'ltr');
      await expect(code).toHaveCSS('overflow-x', 'auto');
    }
    if (width === 320) {
      const commands = page.locator('.guided-code').first();
      await commands.focus();
      await expect(commands).toBeFocused();
    }
    expect(await page.locator('.guided-code').first().evaluate((code) => code.scrollWidth > code.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
}

async function verifySystemLabTheme(page: Page, locale: 'ar' | 'en', name: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator('html')).toHaveCSS('color-scheme', colorScheme);
    await verifyLabViewport(page, locale);
  }
}

async function verifyStaffLayouts(page: Page, courseId: string) {
  for (const locale of ['en', 'ar'] as const) {
    for (const theme of themeCases) {
      await applyTheme(page, theme);
      for (const route of ['question-bank', `builder?id=${courseId}`, 'guided-reviews']) {
        await page.goto(`/${locale}/${route}`);
        await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
        await expect(page.locator('html')).toHaveCSS('color-scheme', theme.colorScheme);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
        for (const width of [320, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        }
      }
    }
  }
}

test.describe('reusable assessments and Guided Labs', () => {
  test.skip(process.env.PHASE5_TEST !== '1', 'Use the isolated Phase 5 runner');

  test('publishes frozen bank content and records scoped Guided Lab completion and review', async ({ browser, page, request, playwright }) => {
    test.setTimeout(150000);
    if (!ownerPassword) throw new Error('Missing isolated Owner credentials');
    const owner = await playwright.request.newContext({ baseURL: origin });
    const author = await browser.newPage({ baseURL: origin });
    const outsider = await playwright.request.newContext({ baseURL: origin });
    const secondDevice = await browser.newPage({ baseURL: origin });
    const evidence = 'The output contained enabled=true.';
    try {
      expect((await request.get('/api/question-bank')).status()).toBe(401);
      expect((await request.get('/api/guided-reviews?locale=en')).status()).toBe(401);
      expect((await post(request, '/api/learning/guided-labs', {})).status()).toBe(401);
      await signIn(owner, { email: 'owner@example.test', password: ownerPassword });
      const instructor = await inviteInstructor(owner, request);
      const peer = await createTestLearner('Unrelated instructor');
      expect((await post(owner, '/api/admin/users', { operation: 'role', id: peer.id, role: 'INSTRUCTOR' })).status()).toBe(200);
      await signIn(author.request, instructor);
      await signIn(outsider, peer);

      const learner = await createTestLearner('Guided learner');
      const otherLearner = await createTestLearner();
      await signIn(page.request, learner);
      await signIn(secondDevice.request, otherLearner);
      for (const endpoint of ['/api/question-bank', '/api/guided-reviews?locale=en']) {
        expect((await page.request.get(endpoint)).status()).toBe(403);
      }

      const questionId = await createQuestion(author);
      expect((await outsider.get(`/api/question-bank?id=${questionId}`)).status()).toBe(403);
      expect(await (await outsider.get('/api/question-bank')).json()).toEqual([]);
      const courseId = await createBaseDraft(author.request);
      await publishPractice(author, courseId, questionId);
      await changeBankAfterPublication(author);

      const unenrolled = { operation: 'save', locale: 'en', id: randomUUID(), labId: randomUUID(),
        checkpointIds: [], evidence: '', completionProvenance: 'SELF_REPORTED' };
      expect((await post(page.request, '/api/learning/guided-labs', unenrolled)).status()).toBe(403);
      await page.goto(`/ar/courses/${slug}`);
      await page.getByRole('button', { name: 'التسجيل في الدورة' }).click();
      await expect(page).toHaveURL(/\/ar\/learning\?id=/);
      const enrollment = new URL(page.url()).searchParams.get('id');
      expect(enrollment).toBeTruthy();
      const player = await (await page.request.get(`/api/learning?locale=en&id=${enrollment}`)).json();
      expect(player.quizzes[0].questions[0]).toEqual({
        id: expect.any(String), prompt: questionPrompt, choices: ['Config file', 'Image file'],
      });
      expect(player.guidedLabs[0]).toMatchObject({ labMode: 'GUIDED', title: labTitle, commands: longCommand, starter: 'enabled=true' });
      const labId = player.guidedLabs[0].id;
      const checkpointIds = player.guidedLabs[0].checkpoints.map(({ id }: { id: string }) => id);
      const submission = { ...unenrolled, operation: 'complete', id: enrollment, labId, checkpointIds, evidence };
      for (const completionProvenance of ['SYSTEM_VERIFIED', 'INSTRUCTOR_REVIEWED']) {
        expect((await post(page.request, '/api/learning/guided-labs', { ...submission, completionProvenance })).status()).toBe(400);
      }
      expect((await post(secondDevice.request, '/api/learning/guided-labs', submission)).status()).toBe(403);
      expect((await secondDevice.request.get(`/api/learning?locale=en&id=${enrollment}`)).status()).toBe(403);

      await expect(page.getByRole('heading', { name: arabicLabTitle })).toBeVisible();
      await page.getByRole('button', { name: 'فاتح', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await verifyLabViewport(page, 'ar');
      await page.getByRole('button', { name: 'داكن', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await verifyLabViewport(page, 'ar');
      await verifySystemLabTheme(page, 'ar', 'حسب النظام');
      await page.getByRole('checkbox', { name: 'افتح الملف' }).check();
      await page.getByLabel('الدليل (اختياري)').fill(evidence);
      await page.getByRole('button', { name: 'حفظ تقدّم المختبر' }).click();
      await expect(page.getByRole('status')).toHaveText('تم حفظ تقدّم المختبر.');
      await page.reload();
      await expect(page.getByRole('checkbox', { name: 'افتح الملف' })).toBeChecked();
      await expect(page.getByLabel('الدليل (اختياري)')).toHaveValue(evidence);
      await page.getByRole('checkbox', { name: 'سجّل القيمة' }).check();
      await page.getByRole('button', { name: 'تسجيل الإكمال بإبلاغ ذاتي' }).click();
      await expect(page.getByText('إبلاغ ذاتي', { exact: true })).toBeVisible();

      expect((await post(secondDevice.request, '/api/auth/sign-out', {})).status()).toBe(200);
      await signIn(secondDevice.request, learner);
      await secondDevice.goto(`/en/learning?id=${enrollment}`);
      await secondDevice.getByRole('button', { name: 'Light', exact: true }).click();
      await expect(secondDevice.locator('html')).toHaveAttribute('data-theme', 'light');
      await verifyLabViewport(secondDevice, 'en');
      await secondDevice.getByRole('button', { name: 'Dark', exact: true }).click();
      await expect(secondDevice.locator('html')).toHaveAttribute('data-theme', 'dark');
      await verifyLabViewport(secondDevice, 'en');
      await verifySystemLabTheme(secondDevice, 'en', 'System');
      await expect(secondDevice.getByText('Self-reported', { exact: true })).toBeVisible();
      await expect(secondDevice.getByText(evidence)).toBeVisible();
      await secondDevice.getByRole('radio', { name: 'Config file' }).check();
      await secondDevice.getByRole('button', { name: 'Submit answers' }).click();
      await expect(secondDevice.getByRole('status')).toHaveText('Score 1/1');

      const completed = await (await page.request.get(`/api/learning?locale=en&id=${enrollment}`)).json();
      const attemptId = completed.guidedLabs[0].attempt.id;
      const review = { attemptId, decision: 'APPROVED', feedback: 'Evidence matches the checkpoint.',
        completionProvenance: 'INSTRUCTOR_REVIEWED' };
      const endpoint = '/api/guided-reviews?locale=en';
      expect((await post(page.request, endpoint, review)).status()).toBe(403);
      expect((await post(outsider, endpoint, review)).status()).toBe(403);
      expect((await post(author.request, endpoint, { ...review, completionProvenance: 'SYSTEM_VERIFIED' })).status()).toBe(400);
      expect(await (await outsider.get(endpoint)).json()).toEqual([]);

      await author.goto('/en/guided-reviews');
      await expect(author.getByText(evidence)).toBeVisible();
      await author.getByLabel('Feedback (optional)').fill(review.feedback);
      await author.getByRole('button', { name: 'Record review' }).click();
      await expect(author.getByText('Instructor-reviewed', { exact: true })).toBeVisible();
      await expect(author.getByText('Completion accepted', { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText('راجعه المدرّب', { exact: true })).toBeVisible();
      await expect(page.getByText('إبلاغ ذاتي', { exact: true })).toBeVisible();
      await expect(page.getByText(evidence)).toBeVisible();
      await expect(page.getByText(review.feedback)).toBeVisible();
      expect((await post(author.request, endpoint, { ...review, feedback: 'Changed' })).status()).toBe(409);
      await verifyStaffLayouts(author, courseId);
    } finally {
      await Promise.all([owner.dispose(), outsider.dispose(), author.close(), secondDevice.close()]);
    }
  });
});
