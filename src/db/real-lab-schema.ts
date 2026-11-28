import { sql } from 'drizzle-orm';
import { boolean, check, index, pgSchema, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './identity-schema';

export const realLab = pgSchema('real_lab');
export const realLabAttempts = realLab.table('attempts', {
  id: uuid().defaultRandom().primaryKey(),
  learnerId: text('learner_id').notNull().references(() => user.id),
  sessionId: text('session_id').notNull(),
  requestId: uuid('request_id').notNull(),
  templateVersion: text('template_version').notNull().default('nginx-reverse-proxy@1'),
  state: text().notNull().default('QUEUED'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  readyAt: timestamp('ready_at', { withTimezone: true }),
  destroyedAt: timestamp('destroyed_at', { withTimezone: true }),
  endReason: text('end_reason'),
  leaseId: uuid('lease_id'),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  validateAfter: timestamp('validate_after', { withTimezone: true }),
}, (table) => [
  unique('real_lab_launch_retry').on(table.learnerId, table.sessionId, table.requestId),
  uniqueIndex('real_lab_one_active_learner').on(table.learnerId).where(sql`${table.state} <> 'DESTROYED'`),
  index('real_lab_attempts_by_learner').on(table.learnerId, table.requestedAt.desc()),
  check('real_lab_template', sql`${table.templateVersion} IN ('nginx-reverse-proxy@1','linux-file-permissions@1','prometheus-exposition@1')`),
  check('real_lab_states', sql`${table.state} IN ('QUEUED','PROVISIONING','READY','RUNNING','VALIDATING','FAILED','PASSED','STOPPING','CLEANUP_FAILED','DESTROYED')`),
  check('real_lab_end_reasons', sql`${table.endReason} IN ('STOPPED','RESET','EXPIRED','CANCELLED','PROVISION_FAILED','INSTANCE_LOST')`),
]);

export const realLabGrants = realLab.table('grants', {
  digest: text().primaryKey(),
  attemptId: uuid('attempt_id').notNull().references(() => realLabAttempts.id),
  operation: text().notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
}, (table) => [
  check('real_lab_grant_operations', sql`${table.operation} IN ('config','apply','preview')`),
  index('real_lab_grants_by_attempt').on(table.attemptId, table.issuedAt),
]);

export const realLabChecks = realLab.table('checks', {
  id: uuid().primaryKey(),
  attemptId: uuid('attempt_id').notNull().references(() => realLabAttempts.id),
  templateVersion: text('template_version').notNull(),
  checkerVersion: text('checker_version').notNull(),
  configurationOk: boolean('configuration_ok').notNull(),
  responseOk: boolean('response_ok').notNull(),
  completionProvenance: text('completion_provenance'),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('real_lab_checker_versions', sql`(${table.templateVersion}, ${table.checkerVersion}) IN (
    ('nginx-reverse-proxy@1','nginx-route@1'),
    ('linux-file-permissions@1','linux-umask@1'),
    ('prometheus-exposition@1','prometheus-exposition@1'))`),
  check('real_lab_system_verification', sql`CASE WHEN ${table.configurationOk} AND ${table.responseOk}
    THEN ${table.completionProvenance} IS NOT DISTINCT FROM 'SYSTEM_VERIFIED'
    ELSE ${table.completionProvenance} IS NULL END`),
  index('real_lab_checks_by_attempt').on(table.attemptId, table.checkedAt.desc()),
]);
