import type { Locale } from '../../i18n/locales';

const destinations = new Set(['dashboard', 'profile', 'admin', 'instructor', 'student', 'builder']);

export function returnPath(locale: Locale, value: unknown) {
  if (typeof value === 'string') {
    const [, prefix, segment, extra] = value.split('/');
    if (value.startsWith('/') && prefix === locale && extra === undefined && destinations.has(segment)) return value;
  }
  return `/${locale}/dashboard`;
}
