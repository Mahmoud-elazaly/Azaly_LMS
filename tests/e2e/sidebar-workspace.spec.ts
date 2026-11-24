import { expect, test, type Page } from '@playwright/test';
import { assessmentCopy } from '../../src/features/assessment/copy';
import { builderCopy } from '../../src/features/authoring/copy';
import { guidedCopy } from '../../src/features/guided/copy';
import { identityCopy } from '../../src/features/identity/copy';
import type { Locale } from '../../src/i18n/locales';
import { copy } from '../../src/i18n/messages';
import { createTestLearner } from './test-accounts';

const origin = 'http://127.0.0.1:3100';
const locales = ['en', 'ar'] as const;
const themes = ['light', 'dark'] as const;
const viewports = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];

async function withoutOverflow(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const utilities = page.locator('.workspace-utilities');
  const items = utilities.locator('a, button');
  const positions = await items.evaluateAll((nodes) => nodes.map((node) => {
    const { y, height, left, right } = node.getBoundingClientRect();
    return {
      center: y + height / 2, left, right,
      nowrap: getComputedStyle(node).whiteSpace === 'nowrap',
      overflows: node.scrollWidth > node.clientWidth + 1,
    };
  }));
  expect(positions.length).toBeGreaterThanOrEqual(4);
  expect(positions.every(({ center, left, right, nowrap, overflows }) =>
    Math.abs(center - positions[0].center) <= 2 && left >= 0 && right <= width && nowrap && !overflows)).toBe(true);
  await expect.poll(() => utilities.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
}

async function checkShell(page: Page, locale: Locale, theme: typeof themes[number], width: number) {
  const t = copy(locale);
  await page.evaluate(async () => { await document.fonts.ready; });
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
  await expect(page.getByRole('link', { name: 'Azaly LMS', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: t('language'), exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: t(theme), exact: true })).toHaveAttribute('aria-pressed', 'true');
  if (width >= 1024) {
    const sidebar = page.locator('.workspace-sidebar');
    await expect(sidebar).toHaveCSS('position', 'sticky');
    const rect = await sidebar.boundingBox();
    expect(rect?.width).toBe(256);
    const contentWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(rect?.x).toBe(locale === 'ar' ? contentWidth - 256 : 0);
    await expect(sidebar.getByRole('link', { name: t('home'), exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: t('courses'), exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: t('about'), exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole('button', { name: t('openMenu'), exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.workspace-sidebar')).toBeHidden();
  }
  await withoutOverflow(page, width);
}

test('workspace utilities stay in one row and the mobile drawer mirrors and restores focus', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const locale of locales) {
    const t = copy(locale);
    for (const theme of themes) {
      await page.context().addCookies([{ name: 'academy-theme', value: theme, url: origin }]);
      await page.goto(`/${locale}`);
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await checkShell(page, locale, theme, viewport.width);
        await expect(page.getByRole('main').getByRole('link', { name: t('browse') })).toBeVisible();
      }
    }
    await page.setViewportSize(viewports[0]);
    const toggle = page.getByRole('button', { name: t('openMenu'), exact: true });
    const drawer = page.getByRole('dialog', { name: t('nav') });
    await toggle.focus();
    await toggle.press('Enter');
    await expect(drawer).toBeVisible();
    await expect(page.locator('[aria-controls="workspace-drawer"]')).toHaveAttribute('aria-expanded', 'true');
    const panel = await drawer.boundingBox();
    if (!panel) throw new Error('Drawer layout is missing');
    expect(panel.x).toBe(locale === 'ar' ? 390 - panel.width : 0);
    await expect(drawer.getByRole('link', { name: t('home') })).toHaveAttribute('aria-current', 'page');
    await expect(drawer.getByRole('button', { name: t('closeMenu') })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(toggle).toBeFocused();

    await toggle.click();
    await page.mouse.click(locale === 'ar' ? 5 : 385, 400);
    await expect(drawer).toBeHidden();
    await toggle.click();
    await drawer.getByRole('link', { name: t('courses'), exact: true }).click();
    await expect(page).toHaveURL(`/${locale}/courses`);
    await expect(drawer).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }
});

test('authenticated workspace keeps role links, authoring tabs and profile readable at every size', async ({ page, browser }) => {
  const password = process.env.AUTH_TEST_OWNER_PASSWORD;
  test.skip(!password, 'Use the isolated platform gate for the authenticated workspace matrix');
  test.setTimeout(180_000);
  const student = await browser.newPage();
  try {
    expect((await page.request.post('/api/auth/sign-in/email', { headers: { Origin: origin },
      data: { email: 'owner@example.test', password } })).status()).toBe(200);
    for (const locale of locales) {
      const t = copy(locale);
      const account = identityCopy(locale);
      const builder = builderCopy(locale);
      for (const theme of themes) {
        await page.context().addCookies([{ name: 'academy-theme', value: theme, url: origin }]);
        for (const route of ['dashboard', 'profile', 'builder', 'question-bank', 'guided-reviews', 'courses', 'admin/users']) {
          await page.goto(`/${locale}/${route}`);
          for (const viewport of viewports) {
            await page.setViewportSize(viewport);
            await checkShell(page, locale, theme, viewport.width);
            await expect(page.getByRole('button', { name: account.logout, exact: true })).toBeVisible();
            if (route === 'profile') {
              const columns = await page.locator('.profile-facts').evaluate((node) => getComputedStyle(node).gridTemplateColumns);
              expect(columns.split(' ')).toHaveLength(viewport.width >= 1024 ? 2 : 1);
            }
            if (route === 'builder' || route === 'question-bank' || route === 'guided-reviews') {
              const tabs = page.getByRole('navigation', { name: t('authoringTools') });
              await expect(tabs).toHaveCSS('flex-wrap', 'nowrap');
              expect(await tabs.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
            }
            if (viewport.width >= 1024) {
              const nav = page.getByRole('navigation', { name: t('nav'), exact: true });
              for (const name of [account.dashboard, account.profile, builder.builder, account.admin]) {
                await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
              }
            }
          }
          const main = page.getByRole('main');
          if (route === 'dashboard') {
            for (const name of [account.profile, t('courses'), builder.builder, assessmentCopy(locale).bank,
              guidedCopy(locale).queue, account.admin]) {
              await expect(main.getByRole('link', { name, exact: true })).toBeVisible();
            }
          }
          if (route === 'profile') {
            await expect(main.getByText('owner@example.test', { exact: true })).toHaveAttribute('dir', 'ltr');
            await expect(main.getByText(account.active, { exact: true })).toBeVisible();
          }
          if (route === 'builder') {
            await expect(main.getByLabel(builder.slug, { exact: true })).toHaveAttribute('dir', 'ltr');
            await expect(main.getByRole('button', { name: builder.create, exact: true })).toBeVisible();
            const tabs = main.getByRole('navigation', { name: t('authoringTools') });
            await expect(tabs.getByRole('link', { name: t('courseImporter'), exact: true })).toBeVisible();
            await expect(main.locator('#course-importer pre')).toHaveCSS('direction', 'ltr');
          }
        }
      }
    }

    const learner = await createTestLearner('Sidebar learner');
    const { email, password: learnerPassword } = learner;
    expect((await student.request.post('/api/auth/sign-in/email', { headers: { Origin: origin },
      data: { email, password: learnerPassword } })).status()).toBe(200);
    await student.goto('/en/dashboard');
    const scope = student.getByRole('navigation', { name: 'Main navigation' });
    await expect(scope.getByRole('link', { name: 'My learning', exact: true })).toBeVisible();
    for (const name of ['Course builder', 'User management', 'Question bank', 'Guided Lab reviews']) {
      await expect(student.getByRole('link', { name, exact: true })).toHaveCount(0);
    }
  } finally {
    await student.close();
  }
});
