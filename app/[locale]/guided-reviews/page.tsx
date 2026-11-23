import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { builderCopy } from '@/features/authoring/copy';
import { authorRoles } from '@/features/authoring/policy';
import { guidedCopy } from '@/features/guided/copy';
import { listGuidedReviews } from '@/features/guided/service';
import { currentPrincipal } from '@/features/identity/session';
import { isLocale } from '@/i18n/locales';
import { GuidedReviewCard } from '../../_components/guided-labs';

export default async function GuidedReviewPage({ params }: PageProps<'/[locale]/guided-reviews'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const text = guidedCopy(locale);
  const principal = await currentPrincipal();
  if (!principal) redirect(`/${locale}/login?next=/${locale}/guided-reviews`);
  if (!authorRoles.some((role) => role === principal.role)) {
    return <section className="page-copy"><h1>{text.queue}</h1><p>{text.denied}</p></section>;
  }
  const entries = await listGuidedReviews(locale).catch(() => null);
  return <section className="page-copy">
    <Link href={`/${locale}/builder`}>{builderCopy(locale).builder}</Link>
    <h1>{text.queue}</h1>
    {entries === null ? <p role="alert">{text.unavailable}</p>
      : entries.length === 0 ? <p>{text.empty}</p>
      : <div className="builder-fields">{entries.map((entry) =>
        <GuidedReviewCard key={entry.attempt.id} locale={locale} entry={entry} />)}</div>}
  </section>;
}
