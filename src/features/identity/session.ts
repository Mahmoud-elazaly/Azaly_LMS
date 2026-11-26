import { headers } from 'next/headers';
import { getAuth } from './auth';
import { AuthorizationError, authorizeRole, isRole, type Role } from './policy';

async function sessionIdentity(requestHeaders: Headers) {
  if (!requestHeaders.get('cookie') || !process.env.BETTER_AUTH_SECRET) return null;
  const session = await getAuth().auth.api.getSession({
    headers: requestHeaders,
    query: { disableRefresh: true, disableCookieCache: true },
  });
  if (!session || ('impersonatedBy' in session.session && session.session.impersonatedBy != null) ||
      ('banned' in session.user && session.user.banned) ||
      !('role' in session.user) || !isRole(session.user.role)) return null;
  return {
    principal: { id: session.user.id, name: session.user.name, email: session.user.email, role: session.user.role },
    token: session.session.token,
  };
}

export async function currentPrincipal(requestHeaders?: Headers) {
  const session = await sessionIdentity(requestHeaders ?? new Headers(await headers()));
  return session?.principal ?? null;
}

export async function requireSession(allowed: readonly Role[], requestHeaders?: Headers) {
  const session = await sessionIdentity(requestHeaders ?? new Headers(await headers()));
  if (!session) throw new AuthorizationError(401);
  authorizeRole(session.principal.role, allowed);
  return session;
}

export async function requireRole(allowed: readonly Role[], requestHeaders?: Headers) {
  return (await requireSession(allowed, requestHeaders)).principal;
}
