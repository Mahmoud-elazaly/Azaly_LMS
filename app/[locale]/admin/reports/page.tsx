import { notFound, redirect } from 'next/navigation';
import { identityCopy } from '@/features/identity/copy';
import { listUsers, managers } from '@/features/identity/management';
import { currentPrincipal } from '@/features/identity/session';
import { isLocale } from '@/i18n/locales';
import { AdminShell, MetricCards } from '../../../_components/admin-shell';

export default async function ReportsPage({ params }: PageProps<'/[locale]/admin/reports'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = identityCopy(locale);
  const principal = await currentPrincipal();
  if (!principal) redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/admin/reports`)}`);
  if (!managers.some((role) => role === principal.role)) return <section className="page-copy"><h1>{t.reports}</h1><p>{t.denied}</p></section>;

  const result = await listUsers().catch(() => null);
  return <AdminShell locale={locale} active="reports">
    <div className="admin-heading"><div><h1>{t.reports}</h1><p>{t.reportsIntro}</p></div></div>
    {result ? <MetricCards locale={locale} metrics={result.metrics} /> : <p role="alert">{t.directoryError}</p>}
  </AdminShell>;
}
