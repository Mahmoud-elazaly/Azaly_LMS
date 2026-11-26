import type { Page } from '@playwright/test';
import type { Theme } from '../../app/_components/theme';

export type ThemeCase = { theme: Theme; colorScheme: 'light' | 'dark' };

export const themeCases: readonly ThemeCase[] = [
  { theme: 'light', colorScheme: 'light' },
  { theme: 'dark', colorScheme: 'dark' },
  { theme: 'system', colorScheme: 'light' },
  { theme: 'system', colorScheme: 'dark' },
];

export async function applyTheme(page: Page, { theme, colorScheme }: ThemeCase) {
  const preference = theme === 'system' ? colorScheme : colorScheme === 'light' ? 'dark' : 'light';
  await page.emulateMedia({ colorScheme: preference });
  await page.context().addCookies([{ name: 'academy-theme', value: theme, url: 'http://127.0.0.1:3100' }]);
}
