import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { listBankQuestions } from '@/features/assessment/service';
import { builderCopy } from '@/features/authoring/copy';
import { authorRoles } from '@/features/authoring/policy';
import { listCourses, readDraft } from '@/features/authoring/service';
import { AuthorizationError } from '@/features/identity/policy';
import { selectedCoursePath } from '@/features/identity/return-path';
import { currentPrincipal } from '@/features/identity/session';
import { direction, isLocale, locales } from '@/i18n/locales';
import { copy } from '@/i18n/messages';
import { AccountIcon } from '../../_components/account-icon';
import { AuthoringNavigation } from '../../_components/authoring-navigation';
import { CourseCreator, CourseEditor } from '../../_components/course-builder';

export default async function BuilderPage({ params, searchParams }: PageProps<'/[locale]/builder'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const text = builderCopy(locale);
  const t = copy(locale);
  const { id } = await searchParams;
  const principal = await currentPrincipal();
  if (!principal) redirect(`/${locale}/login?next=${encodeURIComponent(selectedCoursePath(locale, 'builder', id))}`);
  if (!authorRoles.some((role) => role === principal.role)) {
    return <section className="page-copy"><h1>{text.builder}</h1><p>{text.denied}</p></section>;
  }

  if (id !== undefined && !z.uuid().safeParse(id).success) notFound();
  let result: { courses: Awaited<ReturnType<typeof listCourses>>; draft: Awaited<ReturnType<typeof readDraft>> | null;
    bank: Awaited<ReturnType<typeof listBankQuestions>> }
    | { error: string };
  try {
    const [courses, draft, bank] = await Promise.all([
      listCourses(), typeof id === 'string' ? readDraft(id) : null, typeof id === 'string' ? listBankQuestions() : [],
    ]);
    result = { courses, draft, bank: bank.filter((question) => !question.archived) };
  } catch (error) {
    result = { error: error instanceof AuthorizationError ? text.denied : text.unavailable };
  }

  if ('error' in result) {
    return <section className="page-copy"><h1>{text.builder}</h1><p role="alert">{result.error}</p></section>;
  }

  const { courses, draft, bank } = result;
  return <section className="page-copy">
    <h1>{text.builder}</h1>
    <AuthoringNavigation locale={locale} active="builder" />
    <section className="notice creator-card" aria-labelledby="new-course">
      <h2 id="new-course">{t('newCourse')}</h2>
      <CourseCreator locale={locale} />
    </section>
    <section aria-labelledby="builder-course-list">
      <h2 id="builder-course-list">{text.courseList}</h2>
      {courses.length === 0 ? <p className="notice course-list-empty">{text.empty}</p> : <nav className="builder-course-list"
        aria-labelledby="builder-course-list">
        {courses.map((course) => {
          const title = course.translations[locale]?.title;
          const nameId = `builder-course-${course.id}`;
          return <Link key={course.id} className="card workspace-card course-row" href={`/${locale}/builder?id=${course.id}`}
            aria-labelledby={nameId} aria-current={course.id === id ? 'page' : undefined}>
            <span className="card-icon"><AccountIcon name="book" /></span>
            <span className="course-row-copy">
              <bdi id={nameId} dir={title ? direction(locale) : 'ltr'}>{title || course.slug}</bdi>
              {title && <bdi className="course-slug" dir="ltr" translate="no">{course.slug}</bdi>}
            </span>
            <span className="workspace-metadata">
              {locales.filter((language) => course.translations[language]?.title).map((language) =>
                <bdi className="workspace-chip" key={language} lang={language} dir={direction(language)}>{copy(language)('localeName')}</bdi>)}
            </span>
            <span className="action-arrow"><AccountIcon name="arrow" /></span>
          </Link>;
        })}
      </nav>}
    </section>
    {draft && <CourseEditor key={draft.id} locale={locale} draft={draft} bank={bank} />}
    <section className="notice course-import-card" id="course-importer" aria-labelledby="course-import-title">
      <h2 id="course-import-title">{t('courseImporter')}</h2>
      <p>{t('importIntro')}</p>
      <pre dir="ltr" translate="no" tabIndex={0} role="group" aria-label={t('courseImporter')}><code>pnpm course:import --dry-run course.zip</code></pre>
      <p>{t('importNext')}</p>
    </section>
  </section>;
}
