import Link from 'next/link';
import type { ReactNode } from 'react';
import { identityCopy } from '@/features/identity/copy';
import type { DirectoryResult } from '@/features/identity/directory';
import type { Locale } from '@/i18n/locales';
import { AccountIcon } from './account-icon';

export function AdminShell({ locale, active, children }: { locale: Locale; active: 'users' | 'reports'; children: ReactNode }) {
  const t = identityCopy(locale);
  const links = [
    { label: t.dashboard, path: 'dashboard', icon: 'grid' },
    { label: t.users, path: 'admin/users', icon: 'users' },
    { label: t.courses, path: 'builder', icon: 'book' },
    { label: t.reports, path: 'admin/reports', icon: 'chart' },
  ] as const;
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <nav aria-label={t.adminNavigation}>
        {links.map(({ label, path, icon }) => <Link key={path} href={`/${locale}/${path}`}
          aria-current={path === `admin/${active}` ? 'page' : undefined}>
          <AccountIcon name={icon} />{label}
        </Link>)}
      </nav>
    </aside>
    <div className="admin-content">
      <p className="admin-breadcrumb">{t.administration} <span aria-hidden="true">/</span> <strong>{t[active]}</strong></p>
      {children}
    </div>
  </div>;
}

export function MetricCards({ locale, metrics }: { locale: Locale; metrics: DirectoryResult['metrics'] }) {
  const t = identityCopy(locale);
  const numbers = new Intl.NumberFormat(locale);
  const cards = [
    { label: t.totalUsers, value: metrics.total, icon: 'users' },
    { label: t.activeUsers, value: metrics.active, icon: 'shield' },
    { label: t.pendingInvitations, value: metrics.pending, icon: 'mail' },
  ] as const;
  return <dl className="admin-metrics">
    {cards.map(({ label, value, icon }) => <div className="admin-metric" key={label}>
      <dt>{label}</dt><dd>{numbers.format(value)}</dd>
      <span className="account-icon-tile"><AccountIcon name={icon} /></span>
    </div>)}
  </dl>;
}
