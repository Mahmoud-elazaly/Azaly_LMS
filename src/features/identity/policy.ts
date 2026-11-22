export const roles = ['OWNER', 'ADMIN', 'INSTRUCTOR', 'STUDENT'] as const;
export type Role = (typeof roles)[number];

export class AuthorizationError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403) {
    super(status === 401 ? 'Authentication required' : 'Forbidden');
    this.status = status;
  }
}

export function isRole(value: unknown): value is Role {
  return roles.some((role) => role === value);
}

export function authorizeRole(role: Role | null, allowed: readonly Role[]): Role {
  if (role === null) throw new AuthorizationError(401);
  if (!allowed.includes(role)) throw new AuthorizationError(403);
  return role;
}

export function canAssignRole(actor: Role, current: Role, next: Role): boolean {
  if (current === 'OWNER' || next === 'OWNER') return false;
  if (actor === 'OWNER') return true;
  return actor === 'ADMIN' && current !== 'ADMIN' && next !== 'ADMIN';
}
