import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readPublicCatalog } from '@/db/public-catalog';
import { isLocale } from '@/i18n/locales';
import { copy } from '@/i18n/messages';

export const dynamic = 'force-dynamic';

export default async function Catalog({ params }: PageProps<'/[locale]/courses'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = copy(locale);
  const courses = await readPublicCatalog(locale).catch(() => {
    console.error('Could not load the public course catalog.');
    return null;
  });

  return <section className="page-copy">
    <h1>{t('courses')}</h1><p>{t('catalogIntro')}</p>
    {courses?.length
      ? <ul className="card-grid">{courses.map((course) => <li className="card" key={course.slug}>
        <h2><Link href={`/${locale}/courses/${course.slug}`}>{course.title}</Link></h2><p>{course.summary}</p>
      </li>)}</ul>
      : <p className="notice">{t(courses ? 'empty' : 'unavailable')}</p>}
  </section>;
}
