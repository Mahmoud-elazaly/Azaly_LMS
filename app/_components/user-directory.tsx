'use client';

import { useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { identityCopy } from '@/features/identity/copy';
import { accountSorts, accountStatuses, type DirectoryFilters, type DirectoryResult, type DirectoryUser } from '@/features/identity/directory';
import { canAssignRole, type Role } from '@/features/identity/policy';
import type { Locale } from '@/i18n/locales';
import { AccountIcon } from './account-icon';
import { AccountButton, useAccountFormReady } from './account-ui';
import { MetricCards } from './admin-shell';
import { UserDialog, type UserDialogState } from './user-dialogs';

function initials(name: string, locale: Locale) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join('').toLocaleUpperCase(locale);
}

function filterParams(filters: DirectoryFilters, page?: number) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.role) params.set('role', filters.role);
  if (filters.status) params.set('status', filters.status);
  if (filters.sort !== 'email') params.set('sort', filters.sort);
  if (page && page > 1) params.set('page', String(page));
  return params;
}

export function UserDirectory({ locale, filters, result, actor }: {
  locale: Locale; filters: DirectoryFilters; result: DirectoryResult; actor: { id: string; role: Role };
}) {
  const t = identityCopy(locale);
  const [dialog, setDialog] = useState<UserDialogState | null>(null);
  const [notice, setNotice] = useState('');
  const [loading, startTransition] = useTransition();
  const ready = useAccountFormReady();
  const router = useRouter();
  const base = `/${locale}/admin/users`;
  const numbers = new Intl.NumberFormat(locale);
  const roles = actor.role === 'OWNER' ? ['OWNER', 'ADMIN', 'INSTRUCTOR', 'STUDENT'] as const : ['INSTRUCTOR', 'STUDENT'] as const;
  const sortLabels = { email: t.sortEmail, name: t.sortName, recent: t.sortRecent };

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entries = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === 'string' && value) entries.set(key, value);
    }
    startTransition(() => router.push(`${base}?${entries}`, { scroll: false }));
  }

  function open(item: UserDialogState) {
    setNotice('');
    setDialog(item);
  }

  function refresh(message: string) {
    setDialog(null);
    setNotice(message);
    startTransition(() => router.refresh());
  }

  function actions(user: DirectoryUser) {
    if (user.id === actor.id || !canAssignRole(actor.role, user.role, user.role)) return '—';
    return <div className="admin-row-actions">
      <button type="button" className="account-secondary" disabled={!ready || loading} onClick={() => open({ action: 'edit', user })}>{t.edit}</button>
      {user.status === 'invited' ? <>
        <button type="button" className="account-secondary" disabled={!ready || loading} onClick={() => open({ action: 'resend', user })}>{t.resend}</button>
        <button type="button" className="account-secondary" disabled={!ready || loading} onClick={() => open({ action: 'revoke', user })}>{t.revoke}</button>
      </> : <button type="button" className="account-secondary" disabled={!ready || loading}
        onClick={() => open({ action: 'status', user })}>{user.banned ? t.enable : t.disable}</button>}
    </div>;
  }

  return <>
    <header className="admin-heading">
      <div><h1>{t.admin}</h1><p>{t.adminIntro}</p></div>
      <AccountButton type="button" disabled={!ready || loading} onClick={() => open({ action: 'invite' })}>
        <AccountIcon name="plus" />{t.invite}
      </AccountButton>
    </header>
    <MetricCards locale={locale} metrics={result.metrics} />
    <div className="admin-feedback" role="status">{notice}</div>
    <section aria-labelledby="directory-title" className="admin-table-panel" aria-busy={loading}>
      <div className="admin-table-header">
        <h2 id="directory-title">{t.allUsers}</h2>
        <form action={base} method="get" className="admin-filters" onSubmit={submitFilters} key={filterParams(filters).toString()}>
          <label className="account-field">{t.search}
            <input type="search" name="q" dir="auto" maxLength={120} defaultValue={filters.q} />
          </label>
          <label className="account-field">{t.role}
            <select name="role" defaultValue={filters.role ?? ''}>
              <option value="">{t.allRoles}</option>{roles.map((role) => <option key={role} value={role}>{t[role]}</option>)}
            </select>
          </label>
          <label className="account-field">{t.status}
            <select name="status" defaultValue={filters.status ?? ''}>
              <option value="">{t.allStatuses}</option>
              {accountStatuses.map((status) => <option key={status} value={status}>{t[status]}</option>)}
            </select>
          </label>
          <label className="account-field">{t.sort}
            <select name="sort" defaultValue={filters.sort}>
              {accountSorts.map((sort) => <option key={sort} value={sort}>{sortLabels[sort]}</option>)}
            </select>
          </label>
          <button className="account-secondary" type="submit">{t.apply}</button>
        </form>
      </div>
      <p className="admin-loading" role="status">{loading ? t.loadingUsers : ''}</p>
      {result.users.length ? <table className="admin-table" role="table" aria-labelledby="directory-title">
        <thead role="rowgroup"><tr role="row">
          <th scope="col" role="columnheader">{t.user}</th><th scope="col" role="columnheader">{t.role}</th>
          <th scope="col" role="columnheader">{t.status}</th><th scope="col" role="columnheader">{t.actions}</th>
        </tr></thead>
        <tbody role="rowgroup">
          {result.users.map((user) => <tr role="row" key={user.id}>
            <td role="cell"><div className="admin-person">
              <span className="admin-avatar" aria-hidden="true">{initials(user.name, locale)}</span>
              <div><strong><bdi>{user.name}</bdi></strong><small><bdi dir="ltr">{user.email}</bdi></small></div>
            </div></td>
            <td role="cell"><span className="admin-cell-label" aria-hidden="true">{t.role}</span>{t[user.role]}</td>
            <td role="cell">
              <span className="admin-cell-label" aria-hidden="true">{t.status}</span>
              <span className="admin-badge" data-status={user.status}>{t[user.status]}</span>
              {user.expired && <small className="admin-expired">{t.expired}</small>}
            </td>
            <td role="cell">{actions(user)}</td>
          </tr>)}
        </tbody>
      </table> : <p className="admin-empty">{t.empty}</p>}
      <div className="admin-table-footer">
        <span>{t.results} <strong>{numbers.format(result.total)}</strong></span>
        {result.pages > 1 && <nav aria-label={t.page}>
          {result.page > 1 && <Link href={`${base}?${filterParams(filters, result.page - 1)}`}>{t.previous}</Link>}
          <span>{t.page} {numbers.format(result.page)} / {numbers.format(result.pages)}</span>
          {result.page < result.pages && <Link href={`${base}?${filterParams(filters, result.page + 1)}`}>{t.next}</Link>}
        </nav>}
      </div>
    </section>
    {dialog && <UserDialog locale={locale} actorRole={actor.role} dialog={dialog} close={() => setDialog(null)} done={refresh} />}
  </>;
}
