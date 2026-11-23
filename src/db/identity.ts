import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { directoryPageSize, type DirectoryFilters, type DirectoryResult, type ManagementInput } from '../features/identity/directory';
import { readDatabaseUrl } from './env';

export function identityDatabase(url: string) {
  const connectionString = readDatabaseUrl({ DATABASE_URL: url });
  const pool = new Pool({ connectionString, max: 8, connectionTimeoutMillis: 2500 });
  pool.on('error', () => console.error('An idle authentication database connection failed.'));

  return drizzle(pool);
}

type IdentityDatabase = ReturnType<typeof identityDatabase>;

export async function selectUsers(db: IdentityDatabase, adminScope: boolean, filters: DirectoryFilters) {
  const order = {
    email: sql`lower(email), id`,
    name: sql`lower(name), lower(email), id`,
    recent: sql`created_at DESC, id`,
  }[filters.sort];
  const result = await db.execute<DirectoryResult>(sql`
    WITH directory AS (
      SELECT id, name, email, role, banned, created_at,
        CASE WHEN banned THEN 'disabled' ELSE 'active' END AS status, false AS expired
      FROM identity."user"
      WHERE NOT ${adminScope} OR role IN ('INSTRUCTOR', 'STUDENT')
      UNION ALL
      SELECT id, name, email, role, false, created_at, 'invited', expires_at <= now()
      FROM identity.invitation
      WHERE closed_at IS NULL AND (NOT ${adminScope} OR role IN ('INSTRUCTOR', 'STUDENT'))
    ), matching AS (
      SELECT * FROM directory
      WHERE (strpos(lower(email), lower(${filters.q})) > 0 OR strpos(lower(name), lower(${filters.q})) > 0)
        AND (${filters.role ?? null}::text IS NULL OR role::text = ${filters.role ?? null})
        AND (${filters.status ?? null}::text IS NULL OR status = ${filters.status ?? null})
    ), counted AS (
      SELECT count(*)::integer AS total FROM matching
    ), pagination AS (
      SELECT total, greatest(1, ceil(total / ${directoryPageSize}::numeric)::integer) AS pages FROM counted
    ), selected AS (
      SELECT id, name, email, role, status, banned, expired, row_number() OVER (ORDER BY ${order}) AS position
      FROM matching ORDER BY position LIMIT ${directoryPageSize}
      OFFSET (SELECT (least(${filters.page}, pages) - 1) * ${directoryPageSize} FROM pagination)
    )
    SELECT total, pages, least(${filters.page}, pages) AS page,
      (SELECT json_build_object('total', count(*) FILTER (WHERE status <> 'invited'),
        'active', count(*) FILTER (WHERE status = 'active'),
        'pending', count(*) FILTER (WHERE status = 'invited' AND NOT expired)) FROM directory) AS metrics,
      (SELECT coalesce(json_agg(to_jsonb(selected) - 'position' ORDER BY position), '[]'::json) FROM selected) AS users
    FROM pagination
  `);
  return result.rows[0];
}

export async function changeUser(db: IdentityDatabase, token: string, operation: Extract<ManagementInput, { operation: 'role' | 'status' | 'edit' }>) {
  const { id } = operation;
  const statement = operation.operation === 'edit'
    ? sql`identity.edit_user(${token}, ${id}, ${operation.name}, ${operation.role}::identity.user_role)`
    : sql`identity.manage_user(${token}, ${id},
      ${operation.operation === 'role' ? operation.role : null}::identity.user_role,
      ${operation.operation === 'status' ? operation.banned : null}::boolean)`;
  const result = await db.execute<{ changed: boolean }>(sql`SELECT ${statement} AS changed`);
  return result.rows[0]?.changed === true;
}

type InvitationOperation = Extract<ManagementInput, { operation: 'invite' | 'resend' | 'revoke' }>;

export async function changeInvitation(db: IdentityDatabase, session: string, input: InvitationOperation, id: string, hash: string | null) {
  const invitation = input.operation === 'invite' ? input : null;
  const result = await db.execute<{
    outcome: 'ok' | 'denied' | 'duplicate'; recipient: string | null; language: string | null;
  }>(sql`
    SELECT * FROM identity.manage_invitation(${session}, ${input.operation}, ${id},
      ${invitation?.name ?? null}, ${invitation?.email ?? null},
      ${invitation?.role ?? null}::identity.user_role, ${invitation?.locale ?? null}, ${hash})
  `);
  return result.rows[0];
}

export async function activateAccount(db: IdentityDatabase, tokenHash: string, passwordHash: string) {
  const result = await db.execute<{ activated: boolean }>(sql`
    SELECT identity.activate_invitation(${tokenHash}, ${passwordHash}) AS activated
  `);
  return result.rows[0]?.activated === true;
}

export async function consumeAccountLimit(db: IdentityDatabase, bucket: string, max: number, seconds: number) {
  const result = await db.execute<{ allowed: boolean }>(sql`
    SELECT identity.consume_account_limit(${bucket}, ${max}, ${seconds}) AS allowed
  `);
  return result.rows[0]?.allowed === true;
}
