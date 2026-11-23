'use client';

import { selectedCoursePath, returnPath } from '@/features/identity/return-path';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AccountIcon } from './account-icon';
import type { Locale } from '@/i18n/locales';

export function Navigation({ locale, label, links, language }: {
  locale: Locale;
  label: string;
  links: { path: string; label: string }[];
  language: string;
}) {
  const pathname = usePathname();
  const other = locale === 'ar' ? 'en' : 'ar';
  const suffix = pathname.split('/').slice(2).join('/');

  const query = useSearchParams();
  let alternate = `/${other}${suffix ? `/${suffix}` : ''}`;
  if (suffix === 'learning' || suffix === 'builder') {
    alternate = selectedCoursePath(other, suffix, query.get('id'));
  } else if (suffix === 'login') {
    const params = new URLSearchParams();
    if (query.has('next')) {
      const destination = returnPath(locale, query.get('next')).slice(`/${locale}`.length);
      params.set('next', `/${other}${destination}`);
    }
    if (query.get('activated') === '1') params.set('activated', '1');
    if (params.size) alternate += `?${params}`;
  } else if (suffix === 'admin/users') {
    const filters = new URLSearchParams();
    for (const name of ['q', 'role', 'status', 'sort', 'page']) {
      const value = query.get(name);
      if (value) filters.set(name, value);
    }
    if (filters.size) alternate += `?${filters}`;
  }

  return <>
    <nav aria-label={label}>
      {links.map(({ path, label }) => {
        const href = `/${locale}${path}`;
        return <Link key={path} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>;
      })}
    </nav>
    <a className="language" href={alternate} hrefLang={other} lang={other}
      onClick={(event) => {
        if (suffix !== 'activate' || !window.location.hash || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        window.location.replace(alternate + window.location.hash);
      }}><AccountIcon name="globe" />{language}</a>
  </>;
}
