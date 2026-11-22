export const locales = ['ar', 'en'] as const;
export type Locale = (typeof locales)[number];

export function isLocale(value: string): value is Locale {
  return locales.some((locale) => locale === value);
}

export function direction(locale: Locale) {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
