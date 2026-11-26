import { expect, test, type APIRequestContext } from '@playwright/test';
import { interviewCopy } from '../../src/features/interview/copy';
import { masteryCopy } from '../../src/features/mastery/copy';
import type { InterviewSession, InterviewSummary } from '../../src/features/interview/model';
import type { MasterySnapshot } from '../../src/features/mastery/model';
import { createTestLearner } from './test-accounts';

const origin = 'http://127.0.0.1:3100';
const setup = { role: 'sre', seniority: 'senior', tracks: ['observability', 'git-cicd'], locale: 'en' };
const sizes = [{ width: 390, height: 844 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }];

function post(request: APIRequestContext, path: string, data: object) {
  return request.post(path, { headers: { Origin: origin }, data });
}

async function mastery(request: APIRequestContext): Promise<MasterySnapshot> {
  const response = await request.get('/api/mastery?locale=en');
  expect(response.status()).toBe(200);
  return response.json();
}

test('persists a scoped interview and updates only the owner’s mastery and practice', async ({ page, browser, request }) => {
  test.skip(process.env.PHASE10_TEST !== '1', 'Requires the cumulative gate and isolated Gemini stub.');
  test.setTimeout(120_000);
  const other = await browser.newContext();
  try {
    const [alice, bob] = await Promise.all([createTestLearner('Interview learner A'), createTestLearner('Interview learner B')]);
    const copy = interviewCopy('en');
    const before = await page.goto('/en/interview');
    expect(before?.url()).toContain('/en/login');
    expect((await request.get('/api/interview/history')).status()).toBe(401);
    expect((await post(request, '/api/interview/start', setup)).status()).toBe(401);
    const ownerPassword = process.env.AUTH_TEST_OWNER_PASSWORD;
    if (!ownerPassword) throw new Error('Missing isolated Owner credentials.');
    expect((await post(request, '/api/auth/sign-in/email', { email: 'owner@example.test', password: ownerPassword })).status()).toBe(200);
    expect((await request.get('/api/interview/history')).status()).toBe(403);
    expect((await post(page.request, '/api/auth/sign-in/email', { email: alice.email, password: alice.password })).status()).toBe(200);
    expect((await post(other.request, '/api/auth/sign-in/email', { email: bob.email, password: bob.password })).status()).toBe(200);
    expect((await page.request.post('/api/interview/start', { headers: { Origin: 'https://different.example.test' }, data: setup })).status()).toBe(403);

    const beforeMastery = await mastery(page.request);
    const otherMastery = await mastery(other.request);
    await page.goto('/en/student');
    await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: copy.nav }).click();
    await expect(page.getByRole('heading', { level: 1, name: copy.title })).toBeVisible();
    const role = page.getByRole('combobox', { name: copy.role, exact: true });
    const seniority = page.getByRole('combobox', { name: copy.seniority, exact: true });
    await role.focus();
    await page.keyboard.press('Tab');
    await expect(seniority).toBeFocused();
    await role.selectOption('sre');
    await seniority.selectOption('senior');
    await page.getByRole('checkbox', { name: copy.scopes['git-cicd'] }).check();
    await page.getByRole('button', { name: copy.start }).click();
    await expect(page.getByRole('heading', { name: copy.transcript })).toBeFocused();
    await expect(page.getByRole('list', { name: copy.transcript }).getByText('up', { exact: true })).toBeVisible();

    const historyResponse = await page.request.get('/api/interview/history');
    expect(historyResponse.headers()['cache-control']).toBe('no-store');
    const history: InterviewSummary[] = await historyResponse.json();
    expect(history).toHaveLength(1);
    const [{ id }] = history;
    expect(history[0]).toMatchObject({ role: 'sre', seniority: 'senior', tracks: ['git-cicd', 'observability'], turns: 0 });
    expect(await (await other.request.get('/api/interview/history')).json()).toEqual([]);
    expect((await other.request.get(`/api/interview/history?id=${id}`)).status()).toBe(404);
    expect((await other.request.get(`/api/interview/history?before=${id}`)).status()).toBe(404);
    expect((await post(other.request, '/api/interview/message', { id, turn: 0, answer: 'Other user' })).status()).toBe(404);
    expect((await post(other.request, '/api/interview/evaluate', { id, turn: 0 })).status()).toBe(404);
    expect((await post(page.request, '/api/interview/message', { id, turn: 0, answer: 'س'.repeat(1201) })).status()).toBe(400);

    const answer = page.getByRole('textbox', { name: copy.answer });
    await answer.fill(`Check \`up\` and verify the target. fixture-invalid-scorecard-${id}`);
    await page.getByRole('button', { name: copy.send }).click();
    await expect(page.getByRole('list', { name: copy.transcript }).getByRole('listitem')).toHaveCount(3);
    expect((await post(page.request, '/api/interview/message', { id, turn: 0, answer: 'Stale answer' })).status()).toBe(409);
    for (const turn of [1, 2, 3]) {
      const response = await post(page.request, '/api/interview/message', { id, turn, answer: 'Check target health and confirm recovery.' });
      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({ turns: turn + 1 });
    }
    expect((await post(page.request, '/api/interview/message', { id, turn: 4, answer: 'Exceeded turn cap' })).status()).toBe(409);
    const invalid = await post(page.request, '/api/interview/evaluate', { id, turn: 4 });
    expect(invalid.status()).toBe(502);
    expect(await invalid.json()).toEqual({ error: 502 });
    const pending: InterviewSession = await (await page.request.get(`/api/interview/history?id=${id}`)).json();
    expect(pending).toMatchObject({ turns: 4, scorecard: null });
    expect(pending.messages).toHaveLength(8);
    expect((await mastery(page.request)).weakest).toEqual(beforeMastery.weakest);

    await page.reload();
    await page.getByRole('region', { name: copy.history }).getByRole('button', { name: /SRE/ }).click();
    await expect(page.getByRole('textbox', { name: copy.answer })).toHaveCount(0);
    await page.getByRole('button', { name: copy.evaluate }).click();
    await expect(page.getByRole('heading', { name: copy.scorecard })).toBeFocused();
    await expect(page.getByRole('region', { name: copy.scorecard })).toContainText('Check for a missing series.');
    await expect(page.getByRole('region', { name: copy.scorecard })).toContainText('45%');
    await expect(page.getByRole('link', { name: 'prometheus', exact: true })).toHaveAttribute('href', '/en/knowledge-graph?concept=prometheus');
    const completed: InterviewSession = await (await page.request.get(`/api/interview/history?id=${id}`)).json();
    expect(completed.scorecard).toMatchObject({
      overall_score: 45, technical_accuracy: 60, production_and_security_awareness: 35,
      weak_concept_slugs: ['prometheus', 'blackbox-exporter'],
    });
    expect(completed.outputReserved).toBe(6144);
    expect(completed.messages).toEqual(pending.messages);
    expect((await post(page.request, '/api/interview/evaluate', { id, turn: 4 })).status()).toBe(409);

    const updatedMastery = await mastery(page.request);
    expect(updatedMastery.concepts.find(({ slug }) => slug === 'prometheus')).toMatchObject({
      status: 'needsRemediation', breakdown: { interview: { credit: 45, possible: 100 } },
    });
    expect(updatedMastery.weakest.find(({ slug }) => slug === 'blackbox-exporter')?.action.kind).toBe('concept');
    expect(await mastery(other.request)).toEqual(otherMastery);
    await page.getByRole('link', { name: 'prometheus', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Prometheus', exact: true })).toContainText('45%');
    await page.goto('/en/mastery');
    const weakest = page.getByRole('region', { name: masteryCopy('en').weakest });
    await expect(weakest.getByRole('heading', { name: 'Blackbox Exporter' })).toBeVisible();
    await expect(weakest.getByRole('link', { name: masteryCopy('en').graph })).toHaveAttribute('href', '/en/knowledge-graph?concept=blackbox-exporter');

    for (const locale of ['ar', 'en'] as const) {
      const labels = interviewCopy(locale);
      for (const theme of ['light', 'dark']) {
        await page.context().addCookies([{ name: 'academy-theme', value: theme, url: origin }]);
        await page.goto(`/${locale}/interview`);
        for (const size of sizes) {
          await page.setViewportSize(size);
          await page.evaluate(async () => { await document.fonts.ready; });
          const root = page.locator('html');
          await expect(root).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
          await expect(root).toHaveCSS('color-scheme', theme);
          await expect(page.getByRole('heading', { name: labels.setup })).toBeVisible();
          expect(await root.evaluate((node) => node.scrollWidth), `${locale} ${theme} setup ${size.width}`).toBeLessThanOrEqual(size.width);
        }
        await page.getByRole('region', { name: labels.history }).getByRole('button').first().click();
        const modelCode = page.getByRole('region', { name: labels.scorecard }).locator('pre');
        await expect(modelCode).toHaveAttribute('dir', 'ltr');
        for (const size of sizes) {
          await page.setViewportSize(size);
          expect(await page.locator('html').evaluate((node) => node.scrollWidth), `${locale} ${theme} scorecard ${size.width}`).toBeLessThanOrEqual(size.width);
          if (size.width >= 1280) {
            const transcript = await page.getByRole('region', { name: labels.transcript }).boundingBox();
            const sidebar = await page.getByRole('region', { name: labels.history }).boundingBox();
            expect(Boolean(transcript && sidebar && (locale === 'ar' ? transcript.x > sidebar.x : transcript.x < sidebar.x))).toBe(true);
          }
        }
      }
    }

    await page.goto('/ar/interview');
    const arabic = interviewCopy('ar');
    await page.getByRole('button', { name: arabic.start }).click();
    await expect(page.getByRole('list', { name: arabic.transcript })).toContainText('كيف تتحقق من هدف الجلب');
    await expect(page.getByRole('list', { name: arabic.transcript }).locator('code')).toHaveAttribute('dir', 'ltr');
  } finally {
    await other.close();
  }
});
