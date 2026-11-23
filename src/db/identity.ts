import { asc, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { readDatabaseUrl } from './env';
import { user } from './identity-schema';

export function identityDatabase(url: string) {
  const connectionString = readDatabaseUrl({ DATABASE_URL: url });
  const pool = new Pool({ connectionString, max: 8, connectionTimeoutMillis: 2500 });
  pool.on('error', () => console.error('An idle authentication database connection failed.'));

  return drizzle(pool);
}

type IdentityDatabase = ReturnType<typeof identityDatabase>;

export function selectUsers(db: IdentityDatabase, adminScope: boolean) {
  return db.select({
    id: user.id, name: user.name, email: user.email, role: user.role, banned: user.banned,
  }).from(user).where(adminScope ? inArray(user.role, ['INSTRUCTOR', 'STUDENT']) : undefined)
    .orderBy(asc(user.email));
}

export async function changeUser(db: IdentityDatabase, token: string, id: string, role: string | null, banned: boolean | null) {
  const result = await db.execute<{ changed: boolean }>(sql`
    SELECT identity.manage_user(${token}, ${id}, ${role}::identity.user_role, ${banned}::boolean) AS changed
  `);
  return result.rows[0]?.changed;
}
