import { sql } from 'drizzle-orm';
import { check, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const courseLocale = pgEnum('course_locale', ['ar', 'en']);

export const courses = pgTable('courses', {
  id: uuid().defaultRandom().primaryKey(),
  slug: text().notNull().unique(),
}, (table) => [
  check('courses_slug_format', sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
]);

export const courseVersions = pgTable('course_versions', {
  id: uuid().defaultRandom().primaryKey(),
  courseId: uuid('course_id').notNull().references(() => courses.id),
  revision: integer().notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
}, (table) => [
  unique('course_versions_revision_key').on(table.courseId, table.revision),
  check('course_versions_positive_revision', sql`${table.revision} > 0`),
  index('course_versions_public_idx').on(table.courseId, table.revision.desc()).where(sql`${table.publishedAt} is not null`),
]);

export const courseTranslations = pgTable('course_translations', {
  versionId: uuid('version_id').notNull().references(() => courseVersions.id),
  locale: courseLocale().notNull(),
  title: text().notNull(),
  summary: text().notNull(),
}, (table) => [
  primaryKey({ columns: [table.versionId, table.locale] }),
  check('course_translations_nonempty', sql`length(btrim(${table.title})) > 0 and length(btrim(${table.summary})) > 0`),
]);
