import { changeUser, selectUsers } from '../../db/identity';
import { z } from 'zod';
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
  return selectUsers(getAuth().db, principal.role === 'ADMIN');
}

export async function manageUser(input: z.infer<typeof managementInput>, requestHeaders: Headers) {
  const { token } = await requireSession(managers, requestHeaders);
  const role = input.operation === 'role' ? input.role : null;
  const banned = input.operation === 'status' ? input.banned : null;
  const changed = await changeUser(getAuth().db, token, input.id, role, banned);
  if (!changed) throw new AuthorizationError(403);
}
