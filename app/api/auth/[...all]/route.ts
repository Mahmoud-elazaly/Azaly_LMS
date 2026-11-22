import { z } from 'zod';
import { roles } from '@/features/identity/policy';
import { getAuth } from '@/features/identity/auth';
import { reportAuthFailure } from '@/features/identity/diagnostics';
import { prepareAuthRequest } from '@/features/identity/request';

const publicUser = z.object({
  id: z.string(), name: z.string(), email: z.string(), role: z.enum(roles), banned: z.boolean().optional(),
});
const sessionPayload = z.object({ user: publicUser }).nullable();

const mutations = new Set(['/api/auth/sign-in/email', '/api/auth/sign-up/email', '/api/auth/sign-out']);

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
    const { auth, origin } = getAuth();
    if (!session && request.headers.get('origin') !== origin) {
      return reply({ error: 'FORBIDDEN' }, 403);
    }

    stage = 'request preparation';
    const upstream = await prepareAuthRequest(request, path);
    if (!upstream) return reply({ error: 'AUTH_REQUEST_REJECTED' }, 400);
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
      return reply({ error: 'AUTH_REQUEST_REJECTED' }, status, cookies);
    }

    if (session) {
      const data = sessionPayload.safeParse(await response.json());
      const principal = data.success ? data.data?.user : null;
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
