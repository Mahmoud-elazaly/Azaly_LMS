'use client';

import { selectedCoursePath, returnPath } from '@/features/identity/return-path';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
  } else if ((suffix === 'login' || suffix === 'register') && query.has('next')) {
    const destination = returnPath(locale, query.get('next')).slice(`/${locale}`.length);
    const params = new URLSearchParams({ next: `/${other}${destination}` });
    if (suffix === 'login' && query.get('registered') === '1') params.set('registered', '1');
    alternate += `?${params}`;
  }

  return <>
    <nav aria-label={label}>
      {links.map(({ path, label }) => {
        const href = `/${locale}${path}`;
        return <Link key={path} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>;
      })}
    </nav>
    <a className="language" href={alternate} hrefLang={other} lang={other}>{language}</a>
  </>;
}
