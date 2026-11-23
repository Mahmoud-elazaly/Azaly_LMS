import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readPublicCatalog } from '@/db/public-catalog';
import { isLocale } from '@/i18n/locales';
import { copy } from '@/i18n/messages';
import { currentPrincipal } from '@/features/identity/session';
import { learningCopy } from '@/features/learning/copy';
import { EnrollButton } from '../../../_components/learning';

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
  const principal = await currentPrincipal().catch(() => null);

  return <article className="page-copy">
    <Link href={`/${locale}/courses`}>{t('back')}</Link>
    <h1>{course?.title ?? t('courses')}</h1>
    <p>{course?.summary ?? t('unavailable')}</p>
    {course && !principal && <Link href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/courses/${course.slug}`)}`}>
      {learningCopy(locale).signInToEnroll}
    </Link>}
    {course && principal?.role === 'STUDENT' && <EnrollButton slug={course.slug} locale={locale} />}
  </article>;
}
