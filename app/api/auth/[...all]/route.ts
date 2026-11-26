import { consumeAccountLimit } from '@/db/identity';
import { z } from 'zod';
import { roles } from '@/features/identity/policy';
import { getAuth } from '@/features/identity/auth';
import { reportAuthFailure } from '@/features/identity/diagnostics';
import { prepareAuthRequest } from '@/features/identity/request';

const publicUser = z.object({
  id: z.string(), name: z.string(), email: z.string(), role: z.enum(roles), banned: z.boolean().optional(),
});
const sessionPayload = z.object({
  user: publicUser,
  session: z.object({ impersonatedBy: z.string().nullish() }),
}).nullable();

const mutations = new Set(['/api/auth/sign-in/email', '/api/auth/sign-out']);

function reply(body: Record<string, unknown>, status: number, cookies: string[] = []) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return Response.json(body, { status, headers });
}

async function handle(request: Request) {
  const path = new URL(request.url).pathname;
  const session = request.method === 'GET' && path === '/api/auth/get-session';
  if (!session && (request.method !== 'POST' || !mutations.has(path))) {
    return reply({ error: 'NOT_FOUND' }, 404);
  }

  let stage = 'configuration';
  try {
    const { auth, origin, db, signInBucket } = getAuth();
    if (!session && request.headers.get('origin') !== origin) {
      return reply({ error: 'FORBIDDEN' }, 403);
    }

    stage = 'request preparation';
    const upstream = await prepareAuthRequest(request, path);
    if (!upstream) return reply({ error: 'AUTH_REQUEST_REJECTED' }, 400);
    if (path === '/api/auth/sign-in/email') {
      stage = 'Sign-in rate limit';
      const { email } = await upstream.clone().json() as { email: string };
      if (!await consumeAccountLimit(db, signInBucket(email), 20, 60)) {
        return Response.json({ error: 'RATE_LIMITED' }, {
          status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
        });
      }
    }
    stage = 'initialization';
    await auth.$context;
    stage = 'handler';
    const response = await auth.handler(upstream);
    const cookies = response.headers.getSetCookie();

    if (!response.ok) {
      const status = response.status;
      if (status >= 500) {
        console.error(`[identity] ${path}: Better Auth returned HTTP ${status}`);
        return reply({ error: 'AUTH_UNAVAILABLE' }, 503);
      }
      if (status === 429) {
        const result = reply({ error: 'RATE_LIMITED' }, status);
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) result.headers.set('Retry-After', retryAfter);
        return result;
      }
      const credentialRejection = path === '/api/auth/sign-in/email' && (status === 401 || status === 403);
      return reply({ error: 'AUTH_REQUEST_REJECTED' }, credentialRejection ? 401 : status, cookies);
    }

    if (session) {
      const data = sessionPayload.safeParse(await response.json());
      const principal = data.success && !data.data?.session.impersonatedBy ? data.data?.user : null;
      return reply({
        user: principal && !principal.banned ? {
          id: principal.id,
          name: principal.name,
          email: principal.email,
          role: principal.role,
        } : null,
      }, 200, cookies);
    }
    // Better Auth may include a session token in its own JSON response.
    return reply({ ok: true }, 200, cookies);
  } catch (error) {
    reportAuthFailure(`${path} (${stage})`, error);
    return reply({ error: 'AUTH_UNAVAILABLE' }, 503);
  }
}

export const GET = handle;
export const POST = handle;
