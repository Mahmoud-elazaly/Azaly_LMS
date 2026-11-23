import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, integer, pgSchema, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { roles } from '../features/identity/policy';

export const identity = pgSchema('identity');
export const userRole = identity.enum('user_role', roles);

function timestamps() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  };
}

export const user = identity.table('user', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text(),
  role: userRole().default('STUDENT').notNull(),
  banned: boolean().default(false).notNull(),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires', { withTimezone: true }),
  ...timestamps(),
});

export const session = identity.table('session', {
  id: text().primaryKey(),
  token: text().notNull().unique(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  impersonatedBy: text('impersonated_by'),
  ...timestamps(),
}, (table) => [index('session_user_idx').on(table.userId)]);

export const account = identity.table('account', {
  id: text().primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text(),
  password: text(),
  ...timestamps(),
}, (table) => [
  index('account_user_idx').on(table.userId),
  unique('account_provider_identity_unique').on(table.providerId, table.accountId),
]);

export const verification = identity.table('verification', {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps(),
}, (table) => [index('verification_identifier_idx').on(table.identifier)]);

export const auditEvent = identity.table('audit_event', {
  id: uuid().defaultRandom().primaryKey(),
  action: text().default('user.change').notNull(),
  actorId: text('actor_id').notNull(),
  targetId: text('target_id').notNull(),
  previousRole: userRole('previous_role').notNull(),
  newRole: userRole('new_role').notNull(),
  previousBanned: boolean('previous_banned'),
  newBanned: boolean('new_banned'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const invitation = identity.table('invitation', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull(),
  role: userRole().notNull(),
  locale: text().notNull(),
  tokenHash: text('token_hash').unique('invitation_token_hash_key'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdBy: text('created_by').notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'invitation_created_by_fkey', columns: [table.createdBy], foreignColumns: [user.id] }),
  uniqueIndex('invitation_open_email_idx').on(table.email).where(sql`${table.closedAt} IS NULL`),
  check('invitation_role_check', sql`${table.role} <> 'OWNER'`),
  check('invitation_locale_check', sql`${table.locale} IN ('ar', 'en')`),
  check('invitation_check', sql`(${table.closedAt} IS NULL) = (${table.tokenHash} IS NOT NULL)`),
]);

export const accountRateLimit = identity.table('account_rate_limit', {
  bucket: text().primaryKey(),
  attempts: integer().notNull(),
  resetsAt: timestamp('resets_at', { withTimezone: true }).notNull(),
}, (table) => [index('account_rate_limit_resets_idx').on(table.resetsAt)]);
