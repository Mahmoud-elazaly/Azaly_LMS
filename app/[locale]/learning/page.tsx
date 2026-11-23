import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { selectedCoursePath } from '@/features/identity/return-path';
import { currentPrincipal } from '@/features/identity/session';
import { learningCopy } from '@/features/learning/copy';
import { myEnrollments, readPlayer } from '@/features/learning/service';
import { isLocale } from '@/i18n/locales';
import { CoursePlayer } from '../../_components/learning';

export default async function LearningPage({ params, searchParams }: PageProps<'/[locale]/learning'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const text = learningCopy(locale);
  const { id } = await searchParams;
  const principal = await currentPrincipal();
  if (!principal) redirect(`/${locale}/login?next=${encodeURIComponent(selectedCoursePath(locale, 'learning', id))}`);
  if (principal.role !== 'STUDENT') return <section className="page-copy"><h1>{text.learning}</h1><p>{text.denied}</p></section>;

  if (id !== undefined && !z.uuid().safeParse(id).success) notFound();
  if (typeof id === 'string') {
    const data = await readPlayer(id, locale).catch(() => null);
    return <section className="page-copy">
      <Link href={`/${locale}/learning`}>{text.learning}</Link>
      {data ? <CoursePlayer key={id} locale={locale} data={data} /> : <p role="alert">{text.unavailable}</p>}
    </section>;
  }

  const enrollments = await myEnrollments(locale).catch(() => null);
  return <section className="page-copy">
    <h1>{text.learning}</h1>
    {enrollments === null ? <p role="alert">{text.unavailable}</p>
      : enrollments.length === 0 ? <p>{text.empty}</p>
        : <ul className="identity-users">{enrollments.map((entry) => <li className="notice" key={entry.id}>
          <h2><Link href={`/${locale}/learning?id=${entry.id}`}><bdi>{entry.title}</bdi></Link></h2>
          {!entry.localeAvailable && <p>{text.unavailable}</p>}
          <p>{text.completed} <bdi>{entry.completed}</bdi></p>
        </li>)}</ul>}
  </section>;
}
