import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { identityCopy } from '@/features/identity/copy';
import { directoryFilters } from '@/features/identity/directory';
import { listUsers, managers } from '@/features/identity/management';
import { currentPrincipal } from '@/features/identity/session';
import { isLocale } from '@/i18n/locales';
import { AdminShell } from '../../../_components/admin-shell';
import { UserDirectory } from '../../../_components/user-directory';

export default async function UsersPage({ params, searchParams }: PageProps<'/[locale]/admin/users'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = identityCopy(locale);
  const principal = await currentPrincipal();
  if (!principal) redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/admin/users`)}`);
  if (!managers.some((role) => role === principal.role)) return <section className="page-copy"><h1>{t.admin}</h1><p>{t.denied}</p></section>;

  const filters = directoryFilters(await searchParams);
  const result = await listUsers(undefined, filters).catch(() => null);
  return <AdminShell locale={locale} active="users">
    {result ? <UserDirectory locale={locale} actor={{ id: principal.id, role: principal.role }} filters={filters} result={result} /> :
      <section className="admin-heading">
        <div><h1>{t.admin}</h1><p role="alert">{t.directoryError}</p></div>
        <Link className="account-secondary" href={`/${locale}/admin/users`}>{t.retry}</Link>
      </section>}
  </AdminShell>;
}
