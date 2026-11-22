import { and, desc, eq, isNotNull, lte } from 'drizzle-orm';
import { database } from '@/db/client';
import { courses, courseTranslations, courseVersions } from '@/db/schema';
import type { Locale } from '@/i18n/locales';

export async function readPublicCatalog(locale: Locale, slug?: string) {
  const db = database();
  const latest = db.selectDistinctOn([courseVersions.courseId], {
    id: courseVersions.id,
    courseId: courseVersions.courseId,
  }).from(courseVersions)
    .where(and(isNotNull(courseVersions.publishedAt), lte(courseVersions.publishedAt, new Date())))
    .orderBy(courseVersions.courseId, desc(courseVersions.revision))
    .as('latest');

  return db.select({
    slug: courses.slug,
    title: courseTranslations.title,
    summary: courseTranslations.summary,
  }).from(courses)
    .innerJoin(latest, eq(latest.courseId, courses.id))
    .innerJoin(courseTranslations, and(
      eq(courseTranslations.versionId, latest.id),
      eq(courseTranslations.locale, locale),
    ))
    .where(slug === undefined ? undefined : eq(courses.slug, slug))
    .orderBy(courses.slug);
}
