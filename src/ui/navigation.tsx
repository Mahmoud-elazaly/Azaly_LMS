'use client';

import { usePathname } from 'next/navigation';
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

  return <>
    <nav aria-label={label}>
      {links.map(({ path, label }) => {
        const href = `/${locale}${path}`;
        return <Link key={path} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>;
      })}
    </nav>
    <a className="language" href={`/${other}${suffix ? `/${suffix}` : ''}`} hrefLang={other} lang={other}>{language}</a>
  </>;
}
