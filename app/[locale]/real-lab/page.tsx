import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { RealLab } from '../../_components/real-lab';
import { currentPrincipal } from '@/features/identity/session';
import { isLabTemplateVersion, realLabHref, templateVersion } from '@/features/real-lab/catalog';
import { realLabCopy } from '@/features/real-lab/copy';
import { readRealLab, realLabEnabled } from '@/features/real-lab/service';
import { isLocale } from '@/i18n/locales';

export default async function RealLabPage({ params, searchParams }: PageProps<'/[locale]/real-lab'>) {
  const { locale } = await params;
  if (!isLocale(locale) || !realLabEnabled()) notFound();
  const requested = (await searchParams).template;
  if (requested !== undefined && !isLabTemplateVersion(requested)) notFound();
  const selected = requested ?? templateVersion;
  const copy = realLabCopy(locale, selected);
  const principal = await currentPrincipal();
  if (!principal) redirect(`/${locale}/login?next=${encodeURIComponent(realLabHref(locale, selected))}`);
  const initial = principal.role === 'STUDENT' ? await readRealLab().catch(() => undefined) : null;
  return <section className="page-copy">
    <Link href={`/${locale}/learning`}>{copy.back}</Link>
    {principal.role !== 'STUDENT' || initial === undefined ? <>
      <h1>{copy.title}</h1>
      {initial === undefined ? <p role="alert">{copy.unavailable}</p> : <p>{copy.denied}</p>}
    </> : <RealLab key={selected} locale={locale} initial={initial} selected={selected} />}
  </section>;
}
