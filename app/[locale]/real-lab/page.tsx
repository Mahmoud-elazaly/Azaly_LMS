import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { RealLab } from '../../_components/real-lab';
import { currentPrincipal } from '@/features/identity/session';
import { realLabCopy } from '@/features/real-lab/copy';
import { readRealLab, realLabEnabled } from '@/features/real-lab/service';
import { isLocale } from '@/i18n/locales';

export default async function RealLabPage({ params }: PageProps<'/[locale]/real-lab'>) {
  const { locale } = await params;
  if (!isLocale(locale) || !realLabEnabled()) notFound();
  const copy = realLabCopy(locale);
  const principal = await currentPrincipal();
  if (!principal) redirect(`/${locale}/login?next=/${locale}/real-lab`);
  const initial = principal.role === 'STUDENT' ? await readRealLab().catch(() => undefined) : null;
  return <section className="page-copy">
    <Link href={`/${locale}/learning`}>{copy.back}</Link>
    <h1>{copy.title}</h1>
    {principal.role === 'STUDENT' ? <>
      <p>{copy.introduction}</p>
      <p>{copy.prerequisite}</p>
      {initial === undefined ? <p role="alert">{copy.unavailable}</p> : <RealLab locale={locale} initial={initial} />}
    </> : <p>{copy.denied}</p>}
  </section>;
}
