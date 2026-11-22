import { asc, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { user } from '../../db/identity-schema';
import { getAuth } from './auth';
import { AuthorizationError } from './policy';
import { requireSession } from './session';

export const managers = ['OWNER', 'ADMIN'] as const;
const target = z.string().min(1).max(128);
export const managementInput = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('role'), id: target, role: z.enum(['ADMIN', 'INSTRUCTOR', 'STUDENT']) }),
  z.object({ operation: z.literal('status'), id: target, banned: z.boolean() }),
]);

export async function listUsers(requestHeaders?: Headers) {
  const { principal } = await requireSession(managers, requestHeaders);
  return getAuth().db.select({
    id: user.id, name: user.name, email: user.email, role: user.role, banned: user.banned,
  }).from(user).where(principal.role === 'ADMIN' ? inArray(user.role, ['INSTRUCTOR', 'STUDENT']) : undefined)
    .orderBy(asc(user.email));
}

export async function manageUser(input: z.infer<typeof managementInput>, requestHeaders: Headers) {
  const { token } = await requireSession(managers, requestHeaders);
  const role = input.operation === 'role' ? input.role : null;
  const banned = input.operation === 'status' ? input.banned : null;
  const result = await getAuth().db.execute<{ changed: boolean }>(sql`
    SELECT identity.manage_user(${token}, ${input.id}, ${role}::identity.user_role, ${banned}::boolean) AS changed
  `);
  if (!result.rows[0]?.changed) throw new AuthorizationError(403);
}
