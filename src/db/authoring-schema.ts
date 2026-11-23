import { index, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './identity-schema';
import { courses, courseVersions } from './schema';

const authoring = pgSchema('authoring');

export const drafts = authoring.table('drafts', {
  courseId: uuid('course_id').primaryKey().references(() => courses.id),
  ownerId: text('owner_id').references(() => user.id),
  document: jsonb().notNull(),
  editVersion: integer('edit_version').notNull().default(1),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  lastImportDigest: text('last_import_digest'),
});

export const snapshots = authoring.table('snapshots', {
  versionId: uuid('version_id').primaryKey().references(() => courseVersions.id),
  document: jsonb().notNull(),
});

export const publicationEvents = authoring.table('events', {
  id: uuid().defaultRandom().primaryKey(),
  courseId: uuid('course_id').notNull().references(() => courses.id),
  versionId: uuid('version_id').references(() => courseVersions.id),
  actorId: text('actor_id').notNull(),
  action: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const bankQuestions = authoring.table('bank_questions', {
  id: uuid().defaultRandom().primaryKey(),
  ownerId: text('owner_id').notNull().references(() => user.id),
  question: jsonb().notNull(),
  editVersion: integer('edit_version').notNull().default(1),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('bank_questions_owner_idx').on(table.ownerId)]);
