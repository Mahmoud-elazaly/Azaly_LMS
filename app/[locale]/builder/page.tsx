import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { assessmentCopy } from '@/features/assessment/copy';
import { listBankQuestions } from '@/features/assessment/service';
import { builderCopy } from '@/features/authoring/copy';
import { authorRoles } from '@/features/authoring/policy';
import { listCourses, readDraft } from '@/features/authoring/service';
import { AuthorizationError } from '@/features/identity/policy';
import { guidedCopy } from '@/features/guided/copy';
import { selectedCoursePath } from '@/features/identity/return-path';
import { currentPrincipal } from '@/features/identity/session';
import { direction, isLocale } from '@/i18n/locales';
import { CourseCreator, CourseEditor } from '../../_components/course-builder';

export default async function BuilderPage({ params, searchParams }: PageProps<'/[locale]/builder'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const text = builderCopy(locale);
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
    <div className="builder-controls">
      <Link href={`/${locale}/question-bank`}>{assessmentCopy(locale).bank}</Link>
      <Link href={`/${locale}/guided-reviews`}>{guidedCopy(locale).queue}</Link>
    </div>
    <CourseCreator locale={locale} />
    <nav aria-label={text.courseList}>
      {courses.length === 0 ? <p>{text.empty}</p> : courses.map((course) => <Link key={course.id}
        href={`/${locale}/builder?id=${course.id}`} aria-current={course.id === id ? 'page' : undefined}>
        <bdi dir={course.translations[locale]?.title ? direction(locale) : 'ltr'}>
          {course.translations[locale]?.title || course.slug}
        </bdi>
      </Link>)}
    </nav>
    {draft && <CourseEditor key={draft.id} locale={locale} draft={draft} bank={bank} />}
  </section>;
}
