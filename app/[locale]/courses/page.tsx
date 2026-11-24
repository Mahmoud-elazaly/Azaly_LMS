import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readPublicCatalog } from '@/db/public-catalog';
import { isLocale } from '@/i18n/locales';
import { copy } from '@/i18n/messages';
import { AccountIcon } from '../../_components/account-icon';

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
    <header className="workspace-page-heading"><h1>{t('courses')}</h1><p>{t('catalogIntro')}</p></header>
    {courses?.length
      ? <ul className="card-grid catalog-grid">{courses.map((course) => <li key={course.slug}>
        <Link className="card workspace-card catalog-card" href={`/${locale}/courses/${course.slug}`}
          aria-labelledby={`catalog-${course.slug}`}>
          <div className="catalog-card-top"><span className="card-icon"><AccountIcon name="book" /></span>
            <div className="workspace-metadata"><span className="workspace-pill">{t('published')}</span>
              <span className="workspace-chip">{t('localeName')}</span></div></div>
          <h2 id={`catalog-${course.slug}`}>{course.title}</h2>
          <p>{course.summary}</p>
          <span className="card-cta">{t('openCourse')} <AccountIcon name="arrow" /></span>
        </Link>
      </li>)}</ul>
      : <p className="notice">{t(courses ? 'empty' : 'unavailable')}</p>}
  </section>;
}
