import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { courseDocument } from '../../src/features/curriculum/prometheus-grafana/course';
import { guidedCopy } from '../../src/features/guided/copy';
import { learningCopy } from '../../src/features/learning/copy';
import { masteryCopy } from '../../src/features/mastery/copy';
import type { MasterySnapshot } from '../../src/features/mastery/model';
import { createTestLearner } from './test-accounts';

const origin = 'http://127.0.0.1:3100';
const sizes = [{ width: 390, height: 844 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }];
const title = 'Prometheus';
const quiz = courseDocument.quizzes![0];
const guided = courseDocument.guidedLabs![0];
const lesson = courseDocument.modules[0].lessons[0];

function post(request: APIRequestContext, url: string, data: object) {
  return request.post(url, { headers: { Origin: origin }, data });
}

async function signIn(request: APIRequestContext, email: string, password: string) {
  expect((await post(request, '/api/auth/sign-in/email', { email, password })).status()).toBe(200);
}

async function mastery(request: APIRequestContext) {
  const response = await request.get('/api/mastery?locale=en');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  const body = await response.text();
  expect(body).not.toMatch(/"(?:answers|bankSource|rule|faultyLines|explanation|correct|studentId|learnerId|token)"/);
  expect(body).not.toContain('Unpublished lesson edit');
  return JSON.parse(body) as MasterySnapshot;
}

async function checkLayouts(page: Page) {
  for (const locale of ['ar', 'en'] as const) {
    const labels = masteryCopy(locale);
    for (const theme of ['light', 'dark'] as const) {
      await page.context().addCookies([{ name: 'academy-theme', value: theme, url: origin }]);
      for (const [route, heading] of [['knowledge-graph', labels.graph], ['mastery', labels.mastery]] as const) {
        await page.goto(`/${locale}/${route}`);
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
        await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
        for (const size of sizes) {
          await page.setViewportSize(size);
          await page.evaluate(async () => { await document.fonts.ready; });
          await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
          await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
          if (route === 'knowledge-graph') {
            await expect(page.getByRole('group', { name: labels.graphCanvas })).toHaveAttribute('dir', 'ltr');
            await expect(page.getByRole('combobox', { name: labels.relation })).toBeVisible();
          } else {
            await expect(page.getByRole('img', { name: new RegExp(labels.radar) })).toBeVisible();
            await expect(page.getByRole('region', { name: labels.radar }).getByRole('listitem')).toHaveCount(6);
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth), `${locale}/${route} ${theme}`).toBeLessThanOrEqual(size.width);
        }
      }
    }
  }
}

async function goToWorkspace(page: Page, label: string) {
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: label, exact: true }).click();
}

async function answerQuiz(page: Page, indices: number[], expected: number) {
  const form = page.locator(`#quiz-${quiz.id}`);
  for (const [i, choice] of indices.entries()) await form.getByRole('group').nth(i).getByRole('radio').nth(choice).check();
  await form.getByRole('button', { name: learningCopy('en').submit, exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `${expected}/3` })).toBeVisible();
}

test('explores the bilingual graph and updates private remediation from live learner evidence', async ({ page, browser, request }) => {
  test.skip(process.env.PHASE9_TEST !== '1', 'Use the isolated Phase 9 gate with the published curated course.');
  test.setTimeout(180_000);
  const ownerPassword = process.env.AUTH_TEST_OWNER_PASSWORD;
  if (!ownerPassword) throw new Error('Missing isolated Owner credentials.');
  const other = await browser.newPage();
  try {
    const [alice, bob] = await Promise.all([createTestLearner('Mastery learner A'), createTestLearner('Mastery learner B')]);
    const labels = masteryCopy('en');
    expect((await request.get('/api/mastery?locale=en')).status()).toBe(401);
    expect((await page.goto('/en/knowledge-graph'))?.url()).toContain('/en/login');
    await signIn(request, 'owner@example.test', ownerPassword);
    expect((await request.get('/api/mastery?locale=en')).status()).toBe(403);
    await signIn(page.request, alice.email, alice.password);
    await signIn(other.request, bob.email, bob.password);
    expect((await page.request.get(`/api/mastery?locale=en&learnerId=${bob.id}`)).status()).toBe(400);
    const enrolled = await post(page.request, '/api/learning', { operation: 'enroll', slug: courseDocument.slug, locale: 'en' });
    expect(enrolled.status()).toBe(200);
    const { id } = await enrolled.json() as { id: string };

    await checkLayouts(page);
    await goToWorkspace(page, labels.graph);
    const canvas = page.getByRole('group', { name: labels.graphCanvas });
    await expect(canvas.getByRole('button', { name: /^GitLab CI\b/ })).toBeAttached();
    await page.getByRole('button', { name: labels.zoomIn }).click();
    await expect(page.locator('.mastery-zoom bdi')).toHaveText('125%');
    await canvas.focus();
    await canvas.press('ArrowRight');
    await expect.poll(() => canvas.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    await page.getByRole('button', { name: labels.reset }).click();
    await expect.poll(() => canvas.evaluate((node) => node.scrollLeft)).toBe(0);
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Graph canvas is unavailable.');
    await page.mouse.move(bounds.x + 310, bounds.y + 12);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 160, bounds.y + 12, { steps: 4 });
    await page.mouse.up();
    await expect.poll(() => canvas.evaluate((node) => node.scrollLeft)).toBeGreaterThan(100);

    const track = page.getByRole('combobox', { name: labels.track, exact: true });
    const relation = page.getByRole('combobox', { name: labels.relation, exact: true });
    await track.selectOption('linux-os');
    await expect(canvas.getByRole('button', { name: /^GitLab CI\b/ })).toHaveCount(0);
    await expect(canvas.getByRole('button', { name: /^NGINX Reverse Proxy\b/ })).toBeVisible();
    await relation.selectOption('secures');
    await expect(page.getByText(labels.noGraphMatches)).toBeVisible();
    await track.selectOption('');
    await expect(page.locator('.mastery-edges > path')).toHaveCount(1);
    await expect(page.locator('.mastery-edges > path')).toHaveAttribute('data-relation', 'secures');
    await expect(page).toHaveURL(/relation=secures/);
    await relation.selectOption('');
    await track.selectOption('observability');
    const node = canvas.getByRole('button', { name: /^Prometheus\b/ });
    await node.focus();
    await node.press('Enter');
    const drawer = page.getByRole('dialog', { name: title });
    await expect(drawer.getByRole('button', { name: labels.close })).toBeFocused();
    await expect(drawer.locator('[lang="ar"]')).toContainText('اجمع السلاسل الزمنية');
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(node).toBeFocused();
    await node.click();
    await drawer.getByRole('link', { name: lesson.titles.en, exact: true }).click();
    await expect(page).toHaveURL(`/en/learning?id=${id}&lesson=${lesson.id}#current-lesson`);
    await expect(page.locator('#current-lesson').getByRole('heading', { name: lesson.titles.en })).toBeVisible();
    await page.locator('#current-lesson').getByRole('button', { name: learningCopy('en').complete, exact: true }).click();
    await expect(page.getByRole('button', { name: learningCopy('en').done, exact: true })).toBeDisabled();

    await goToWorkspace(page, labels.graph);
    await node.click();
    await drawer.getByRole('link', { name: quiz.titles.en, exact: true }).click();
    await expect(page).toHaveURL(`/en/learning?id=${id}#quiz-${quiz.id}`);
    await answerQuiz(page, [0, 1, 0], 0);
    await goToWorkspace(page, labels.mastery);
    const queue = page.getByRole('region', { name: labels.weakest });
    const entry = queue.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await expect(entry.getByRole('link', { name: quiz.titles.en, exact: true })).toBeVisible();
    expect((await mastery(page.request)).concepts.find(({ slug }) => slug === 'prometheus')).toMatchObject({
      score: 6, status: 'needsRemediation', breakdown: { lessons: { credit: 1, possible: 4 }, quizzes: { credit: 0, attempted: 3 } },
    });
    const untouched = await mastery(other.request);
    expect(untouched.concepts.find(({ slug }) => slug === 'prometheus')).toMatchObject({ score: 0, status: 'notStarted' });
    expect(JSON.stringify(untouched)).not.toContain(id);

    await entry.getByRole('link', { name: quiz.titles.en, exact: true }).click();
    await answerQuiz(page, [1, 0, 2], 3);
    await goToWorkspace(page, labels.mastery);
    await expect(entry.getByRole('link', { name: guided.titles.en, exact: true })).toBeVisible();
    await goToWorkspace(page, labels.graph);
    await node.click();
    await drawer.getByRole('link', { name: guided.titles.en, exact: true }).click();
    await expect(page).toHaveURL(`/en/learning?id=${id}#guided-${guided.id}`);
    const lab = page.locator(`#guided-${guided.id}`);
    for (const checkbox of await lab.getByRole('checkbox').all()) await checkbox.check();
    await lab.getByRole('button', { name: guidedCopy('en').complete, exact: true }).click();
    await expect(lab.getByText(guidedCopy('en').selfReported, { exact: true })).toBeVisible();
    await goToWorkspace(page, labels.mastery);
    await expect(page).toHaveURL('/en/mastery');
    await expect(entry.getByRole('link', { name: courseDocument.modules[0].lessons[1].titles.en, exact: true })).toBeVisible();
    await expect(entry.locator('.mastery-score bdi')).toHaveText('64%');
    expect((await mastery(page.request)).concepts.find(({ slug }) => slug === 'prometheus')).toMatchObject({
      status: 'inProgress', breakdown: { quizzes: { credit: 3, attempted: 3 }, labs: { credit: 0.5, possible: 1 } },
    });
    expect((await mastery(other.request)).weakest).toEqual(untouched.weakest);
  } finally {
    await other.close();
  }
});
