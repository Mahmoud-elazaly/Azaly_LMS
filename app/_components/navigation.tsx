'use client';

import { selectedCoursePath, returnPath } from '@/features/identity/return-path';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { AccountIcon } from './account-icon';
import type { Locale } from '@/i18n/locales';

export type NavigationGroup = {
  label?: string;
  links: { path: string; label: string; icon: ComponentProps<typeof AccountIcon>['name'] }[];
};

export function Navigation({ locale, label, groups, onNavigate }: {
  locale: Locale;
  label: string;
  groups: NavigationGroup[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return <nav className="workspace-navigation" aria-label={label}>
    {groups.map((group) => <div className="workspace-nav-group" key={group.links[0].path}>
      {group.label && <h2 className="workspace-nav-label">{group.label}</h2>}
      <ul>{group.links.map(({ path, label, icon }) => {
        const href = `/${locale}${path}`;
        const active = pathname === href || (path === '/courses' && pathname.startsWith(`${href}/`));
        return <li key={path}><Link href={href} onNavigate={onNavigate} aria-current={active ? 'page' : undefined}>
          <AccountIcon name={icon} /><span>{label}</span>
        </Link></li>;
      })}</ul>
    </div>)}
  </nav>;
}

export function LocaleSwitch({ locale, language }: { locale: Locale; language: string }) {
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

  return <a className="language" href={alternate} hrefLang={other} lang={other}
      onClick={(event) => {
        if (suffix !== 'activate' || !window.location.hash || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        window.location.replace(alternate + window.location.hash);
      }}><AccountIcon name="globe" /><span>{language}</span></a>;
}
