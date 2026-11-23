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
