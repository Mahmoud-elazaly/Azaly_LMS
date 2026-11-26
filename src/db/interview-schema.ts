import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './identity-schema';
import { courseLocale } from './schema';

export const interview = pgSchema('interview');

export const interviewSessions = interview.table('sessions', {
  id: uuid().defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: text().notNull(),
  seniority: text().notNull(),
  tracks: text().array().notNull(),
  locale: courseLocale().notNull(),
  turns: integer().notNull().default(0),
  inputReserved: integer('input_reserved').notNull().default(0),
  outputReserved: integer('output_reserved').notNull().default(0),
  scorecard: jsonb('scorecard_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  leaseId: uuid('lease_id'),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  leaseOperation: text('lease_operation'),
}, (t) => [
  index('interview_user_history_idx').on(t.userId, t.createdAt.desc(), t.id.desc()),
  check('interview_role', sql`${t.role} IN ('sysadmin', 'devops', 'sre')`),
  check('interview_seniority', sql`${t.seniority} IN ('junior', 'mid', 'senior')`),
  check('interview_tracks', sql`cardinality(${t.tracks}) BETWEEN 1 AND 7 AND
    ${t.tracks} <@ ARRAY['linux','web-proxy','git-cicd','containers','observability','security','iac']::text[]`),
  check('interview_budgets', sql`${t.turns} BETWEEN 0 AND 4 AND
    ${t.inputReserved} BETWEEN 0 AND 65536 AND ${t.outputReserved} BETWEEN 0 AND 6144`),
  check('interview_completion', sql`(${t.completedAt} IS NULL AND ${t.scorecard} IS NULL)
    OR (${t.completedAt} IS NOT NULL AND ${t.scorecard} IS NOT NULL AND jsonb_typeof(${t.scorecard}) = 'object' AND ${t.turns} > 0)`),
  check('interview_lease', sql`(${t.leaseId} IS NULL AND ${t.leaseUntil} IS NULL AND ${t.leaseOperation} IS NULL)
    OR (${t.leaseId} IS NOT NULL AND ${t.leaseUntil} IS NOT NULL AND ${t.leaseOperation} IS NOT NULL
      AND ${t.leaseOperation} IN ('start','message','evaluate'))`),
]);

export const interviewMessages = interview.table('messages', {
  sessionId: uuid('session_id').notNull().references(() => interviewSessions.id, { onDelete: 'cascade' }),
  position: integer().notNull(),
  speaker: text().notNull(),
  body: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.sessionId, t.position] }),
  check('interview_message_position', sql`${t.position} BETWEEN 0 AND 7 AND
    ((${t.position} % 2 = 0 AND ${t.speaker} = 'interviewer') OR (${t.position} % 2 = 1 AND ${t.speaker} = 'learner'))`),
  check('interview_message_body', sql`length(btrim(${t.body})) > 0 AND octet_length(${t.body}) <= 4096`),
]);

export const interviewRateLimits = interview.table('rate_limits', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  windowStarted: timestamp('window_started', { withTimezone: true }).notNull(),
  requests: integer().notNull(),
}, (t) => [check('interview_request_count', sql`${t.requests} BETWEEN 1 AND 12`)]);
