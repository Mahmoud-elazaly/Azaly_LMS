import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readPublicCatalog } from '@/features/catalog/public-catalog';
import { isLocale } from '@/i18n/locales';
import { copy } from '@/i18n/messages';

export const dynamic = 'force-dynamic';

export default async function Course({ params }: PageProps<'/[locale]/courses/[slug]'>) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
  const t = copy(locale);
  const courses = await readPublicCatalog(locale, slug).catch(() => {
    console.error('Could not load public course details.');
    return null;
  });
  if (courses && !courses.length) notFound();
  const course = courses?.[0];

  return <article className="page-copy">
    <Link href={`/${locale}/courses`}>{t('back')}</Link>
    <h1>{course?.title ?? t('courses')}</h1>
    <p>{course?.summary ?? t('unavailable')}</p>
  </article>;
}
