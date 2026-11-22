import { getAuth } from '@/features/identity/auth';
import { listUsers, managementInput, managers, manageUser } from '@/features/identity/management';
import { AuthorizationError } from '@/features/identity/policy';
import { requireRole } from '@/features/identity/session';

const headers = { 'Cache-Control': 'no-store' };

function failure(error: unknown) {
  const status = error instanceof AuthorizationError ? error.status : 503;
  return Response.json({ error: status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'UNAVAILABLE' }, { status, headers });
}

export async function GET(request: Request) {
  try {
    return Response.json({ users: await listUsers(request.headers) }, { headers });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(managers, request.headers);
    if (request.headers.get('origin') !== getAuth().origin) throw new AuthorizationError(403);
    const input = managementInput.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: 'INVALID_INPUT' }, { status: 400, headers });
    await manageUser(input.data, request.headers);
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    return failure(error);
  }
}
