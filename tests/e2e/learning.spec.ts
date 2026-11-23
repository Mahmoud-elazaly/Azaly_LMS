import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createTestLearner } from './test-accounts';

const origin = 'http://127.0.0.1:3100';
const slug = 'student-linux-essentials';
const ownerPassword = process.env.AUTH_TEST_OWNER_PASSWORD;

function post(request: APIRequestContext, url: string, data: object) {
  return request.post(url, { headers: { Origin: origin }, data });
}

async function signIn(page: Page, credentials: { email: string; password: string }) {
  await page.goto('/en/login');
  await page.getByLabel('Email address').fill(credentials.email);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
}

test.describe('learner experience on an isolated database', () => {
  test.skip(process.env.PHASE4_TEST !== '1', 'The Phase 4 runner provisions learner credentials');

  test('enrolls, resumes across sessions, grades on the server and denies cross-student access', async ({ browser, page, request }) => {
    test.setTimeout(90000);
    if (!ownerPassword) throw new Error('Missing isolated Owner credentials');
    expect((await request.get('/api/learning?locale=en')).status()).toBe(401);
    const enroll = { operation: 'enroll', slug, locale: 'en' };
    expect((await post(request, '/api/learning', enroll)).status()).toBe(401);
    const forgedId = randomUUID();
    expect((await post(request, '/api/learning', { operation: 'complete', locale: 'en', id: forgedId, lessonId: forgedId })).status()).toBe(401);
    expect((await post(request, '/api/learning', { operation: 'submit', locale: 'en', id: forgedId })).status()).toBe(401);
    await page.goto('/ar/learning');
    await expect(page).toHaveURL(/\/ar\/login\?next=/);

    const learner = await createTestLearner();
    const second = await createTestLearner();
    const owner = await browser.newPage();
    const otherStudent = await browser.newPage();
    const secondDevice = await browser.newPage();
    const lessonId = randomUUID();
    const lastLessonId = randomUUID();
    const quizId = randomUUID();
    const questionId = randomUUID();

    try {
      await signIn(page, learner);
      await signIn(owner, { email: 'owner@example.test', password: ownerPassword });
      const create = await post(owner.request, '/api/authoring', { operation: 'create', slug });
      expect(create.status()).toBe(200);
      const { id }: { id: string } = await create.json();
      expect((await post(page.request, '/api/learning', enroll)).status()).toBe(400);

      const saved = await post(owner.request, '/api/authoring', { operation: 'save', id, version: 1, document: {
        slug, position: 0, translations: {
          en: { title: 'Linux Essentials', summary: 'A student course' },
          ar: { title: 'أساسيات لينكس', summary: 'دورة للطلاب' },
        },
        modules: [{ id: randomUUID(), titles: { en: 'Shell module', ar: 'وحدة الطرفية' }, lessons: [
          { id: lessonId, titles: { en: 'List files', ar: 'عرض الملفات' }, blocks: [{
            id: randomUUID(), type: 'code', translations: { en: 'ls -l', ar: 'ls -la ' + 'a'.repeat(160) },
          }] },
          { id: lastLessonId, titles: { en: 'Find your directory', ar: 'معرفة المجلد الحالي' }, blocks: [{
            id: randomUUID(), type: 'code', translations: { en: 'pwd', ar: 'pwd' },
          }] },
        ] }],
        quizzes: [{ id: quizId, titles: { en: 'Shell quiz', ar: 'اختبار الطرفية' }, questions: [{
          id: questionId, correct: 1, translations: {
            en: { prompt: 'Which command lists files?', choices: ['pwd', 'ls'] },
            ar: { prompt: 'أي أمر يعرض الملفات؟', choices: ['pwd', 'ls'] },
          },
        }] }],
      } });
      expect(saved.status()).toBe(200);
      await owner.goto(`/en/builder?id=${id}`);
      await expect(owner.getByLabel('Quiz title')).toHaveValue('Shell quiz');
      await expect(owner.getByLabel('Correct choice')).toHaveValue('1');
      await owner.getByRole('button', { name: 'Publish', exact: true }).click();
      await expect(owner.locator('form.builder-fields').getByRole('status')).toHaveText('Course published.');
      expect((await post(owner.request, '/api/learning', enroll)).status()).toBe(403);

      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`/ar/courses/${slug}`);
      await page.getByRole('button', { name: 'التسجيل في الدورة' }).click();
      await expect(page).toHaveURL(/\/ar\/learning\?id=/);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.getByRole('heading', { name: 'أساسيات لينكس' })).toBeVisible();
      await expect(page.locator('pre')).toHaveAttribute('dir', 'ltr');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
      const enrollment = new URL(page.url()).searchParams.get('id');
      expect(enrollment).toBeTruthy();
      const enrollmentPath = `/en/learning?id=${enrollment}`;
      await page.getByRole('link', { name: 'English', exact: true }).click();
      await expect(page).toHaveURL(enrollmentPath);
      await expect(page.getByRole('heading', { name: 'Linux Essentials' })).toBeVisible();
      await page.getByRole('link', { name: 'العربية', exact: true }).click();
      await expect(page).toHaveURL(`/ar/learning?id=${enrollment}`);
      const before = await page.request.get(`/api/learning?locale=ar&id=${enrollment}`);
      expect(before.status()).toBe(200);
      const player = await before.json();
      expect(player.quizzes[0].questions[0]).toEqual({
        id: questionId, prompt: 'أي أمر يعرض الملفات؟', choices: ['pwd', 'ls'],
      });

      await page.getByRole('button', { name: 'إكمال الدرس' }).click();
      await expect(page.getByText('الدروس المكتملة 1/2')).toBeVisible();
      await page.getByRole('button', { name: 'حفظ الدرس', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'الدروس المحفوظة' })).toBeVisible();
      await page.getByRole('button', { name: 'معرفة المجلد الحالي' }).click();
      await expect(page.getByRole('heading', { name: 'معرفة المجلد الحالي' })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('heading', { name: 'معرفة المجلد الحالي' })).toBeVisible();

      const submit = { operation: 'submit', locale: 'ar', id: enrollment, quizId, attemptId: randomUUID(), answers: { [questionId]: 1 } };
      expect((await post(page.request, '/api/learning', { ...submit, score: 100 })).status()).toBe(400);
      await page.getByRole('radio', { name: 'ls', exact: true }).check();
      await page.getByRole('button', { name: 'إرسال الإجابات' }).click();
      await expect(page.getByRole('status')).toHaveText('الدرجة 1/1');
      await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
      await expect(page).toHaveURL(/\/ar$/);

      await secondDevice.goto(enrollmentPath);
      await secondDevice.getByLabel('Email address').fill(learner.email);
      await secondDevice.getByLabel('Password', { exact: true }).fill(learner.password);
      await secondDevice.getByRole('button', { name: 'Sign in' }).click();
      await expect(secondDevice).toHaveURL(enrollmentPath);
      await secondDevice.getByRole('navigation').getByRole('link', { name: 'My learning' }).click();
      await secondDevice.getByRole('link', { name: 'Linux Essentials' }).click();
      await expect(secondDevice).toHaveURL(enrollmentPath);
      await expect(secondDevice.getByRole('heading', { name: 'Find your directory' })).toBeVisible();
      await expect(secondDevice.locator('html')).toHaveAttribute('dir', 'ltr');
      await expect(secondDevice.getByText('Completed lessons 1/2')).toBeVisible();
      await expect(secondDevice.getByRole('heading', { name: 'Grade history' })).toBeVisible();
      await expect(secondDevice.getByRole('listitem').filter({ hasText: 'Shell quiz 1/1' })).toBeVisible();

      await signIn(otherStudent, second);
      expect((await otherStudent.request.get(`/api/learning?locale=en&id=${enrollment}`)).status()).toBe(403);
      expect((await post(otherStudent.request, '/api/learning', { operation: 'complete', id: enrollment, locale: 'en', lessonId })).status()).toBe(403);
      expect((await post(otherStudent.request, '/api/learning', submit)).status()).toBe(403);
    } finally {
      await Promise.all([owner.close(), otherStudent.close(), secondDevice.close()]);
    }
  });
});
