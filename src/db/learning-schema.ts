import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgSchema, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { user } from './identity-schema';
import { courseVersions, courses } from './schema';

const learning = pgSchema('learning');
export const enrollments = learning.table('enrollments', {
  id: uuid().defaultRandom().primaryKey(),
  studentId: text('student_id').notNull().references(() => user.id),
  courseId: uuid('course_id').notNull().references(() => courses.id),
  versionId: uuid('version_id').notNull().references(() => courseVersions.id),
  resumeLessonId: uuid('resume_lesson_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [unique('enrollments_student_course_unique').on(table.studentId, table.courseId)]);

export const lessonProgress = learning.table('lesson_progress', {
  enrollmentId: uuid('enrollment_id').notNull().references(() => enrollments.id),
  lessonId: uuid('lesson_id').notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  bookmarked: boolean().notNull().default(false),
}, (table) => [primaryKey({ columns: [table.enrollmentId, table.lessonId] })]);

export const attempts = learning.table('attempts', {
  id: uuid().primaryKey(),
  enrollmentId: uuid('enrollment_id').notNull().references(() => enrollments.id),
  quizId: uuid('quiz_id').notNull(),
  answers: jsonb().notNull(),
  score: integer().notNull(),
  total: integer().notNull(),
  gradedAt: timestamp('graded_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('attempts_score_range', sql`${table.total} > 0 AND ${table.score} BETWEEN 0 AND ${table.total}`),
  index('attempts_enrollment_idx').on(table.enrollmentId),
]);

export const guidedAttempts = learning.table('guided_attempts', {
  id: uuid().defaultRandom().primaryKey(),
  enrollmentId: uuid('enrollment_id').notNull().references(() => enrollments.id),
  labId: uuid('lab_id').notNull(),
  checkpoints: jsonb().notNull().default(sql`'[]'::jsonb`),
  evidence: text().notNull().default(''),
  completionProvenance: text('completion_provenance'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
}, (table) => [
  unique('guided_attempts_enrollment_lab_unique').on(table.enrollmentId, table.labId),
  check('guided_attempts_checkpoints_array', sql`jsonb_typeof(${table.checkpoints}) = 'array'`),
  check('guided_attempts_evidence_limit', sql`length(${table.evidence}) <= 4000`),
  check('guided_attempts_self_report_only', sql`(${table.submittedAt} IS NULL AND ${table.completionProvenance} IS NULL) OR (${table.submittedAt} IS NOT NULL AND ${table.completionProvenance} IS NOT DISTINCT FROM 'SELF_REPORTED')`),
]);

export const guidedReviews = learning.table('guided_reviews', {
  attemptId: uuid('attempt_id').primaryKey().references(() => guidedAttempts.id),
  reviewerId: text('reviewer_id').notNull().references(() => user.id),
  completionProvenance: text('completion_provenance').notNull().default('INSTRUCTOR_REVIEWED'),
  decision: text().notNull(),
  feedback: text().notNull().default(''),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('guided_reviews_instructor_only', sql`${table.completionProvenance} = 'INSTRUCTOR_REVIEWED'`),
  check('guided_reviews_decision', sql`${table.decision} IN ('APPROVED', 'NOT_APPROVED')`),
  check('guided_reviews_feedback_limit', sql`length(${table.feedback}) <= 2000`),
]);
