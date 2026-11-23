import { describe, expect, it } from 'vitest';
import { readDatabaseUrl } from '../../src/db/env';
import { direction, isLocale } from '../../src/i18n/locales';
import { parseTheme } from '../../app/_components/theme';

describe('foundation configuration', () => {
  it('maps only supported locales to document directions', () => {
    expect(isLocale('fr')).toBe(false);
    expect(isLocale('ar')).toBe(true);
    expect(direction('ar')).toBe('rtl');
    expect(direction('en')).toBe('ltr');
  });

  it('uses system preference when a theme cookie is invalid', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('blue')).toBe('system');
  });

  it('validates the Postgres connection string and redacts failures', () => {
    const url = 'postgresql://academy@localhost/academy';
    expect(readDatabaseUrl({ DATABASE_URL: url })).toBe(url);
    expect(() => readDatabaseUrl({})).toThrow('DATABASE_URL');
    expect(() => readDatabaseUrl({ DATABASE_URL: 'https://secret@example.test/data' }))
      .toThrow(/^DATABASE_URL must be a PostgreSQL URL with a host, user and database\.$/);
  });
});
