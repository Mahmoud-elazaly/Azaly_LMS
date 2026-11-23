import { z } from 'zod';
import type { Locale } from '../../i18n/locales';

const destinations = new Set(['dashboard', 'profile', 'admin', 'instructor', 'student', 'builder', 'learning']);

export function selectedCoursePath(locale: Locale, page: 'builder' | 'learning', id: unknown) {
  const base = `/${locale}/${page}`;
  const selection = z.uuid().safeParse(id);
  return selection.success ? `${base}?id=${selection.data}` : base;
}

export function returnPath(locale: Locale, value: unknown) {
  const fallback = `/${locale}/dashboard`;
  const prefix = `/${locale}/`;
  if (typeof value !== 'string' || !value.startsWith(prefix)) return fallback;
  const path = value.slice(prefix.length);
  if (destinations.has(path) || /^courses\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)) return value;
  const match = /^(builder|learning)\?id=([^&?#]+)$/.exec(path);
  if (match && (match[1] === 'builder' || match[1] === 'learning') &&
      selectedCoursePath(locale, match[1], match[2]) === value) return value;
  return fallback;
}
