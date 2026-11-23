import { z } from 'zod';
import { roles, type Role } from './policy';

export const assignableRoles = ['STUDENT', 'INSTRUCTOR', 'ADMIN'] as const;
export const accountStatuses = ['active', 'invited', 'disabled'] as const;
export const accountSorts = ['email', 'name', 'recent'] as const;
export const directoryPageSize = 12;
export const passwordMinimum = 12;
export const passwordMaximum = 128;

export const activationInput = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: z.string().min(passwordMinimum).max(passwordMaximum),
});
const fullName = z.string().trim().min(1).max(120);
const target = z.string().min(1).max(128);
export const managementInput = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('role'), id: target, role: z.enum(assignableRoles) }),
  z.object({ operation: z.literal('status'), id: target, banned: z.boolean() }),
  z.object({ operation: z.literal('edit'), id: target, name: fullName, role: z.enum(assignableRoles) }),
  z.object({
    operation: z.literal('invite'), name: fullName, email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    role: z.enum(assignableRoles), locale: z.enum(['ar', 'en']).default('en'),
  }),
  z.object({ operation: z.literal('resend'), id: target }),
  z.object({ operation: z.literal('revoke'), id: target }),
]);
export type ManagementInput = z.infer<typeof managementInput>;

const directoryInput = z.object({
  q: z.string().trim().max(120).catch(''),
  sort: z.enum(accountSorts).catch('email'),
  page: z.coerce.number().int().min(1).max(1_000_000).catch(1),
});

export function directoryFilters(input: Record<string, unknown>) {
  const { q, sort, page } = directoryInput.parse(input);
  return {
    q, sort, page,
    role: z.enum(roles).safeParse(input.role).data,
    status: z.enum(accountStatuses).safeParse(input.status).data,
  };
}

export type DirectoryFilters = ReturnType<typeof directoryFilters>;
export type DirectoryUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: (typeof accountStatuses)[number];
  banned: boolean;
  expired: boolean;
};
export type DirectoryResult = {
  users: DirectoryUser[];
  metrics: { total: number; active: number; pending: number };
  total: number;
  page: number;
  pages: number;
};
