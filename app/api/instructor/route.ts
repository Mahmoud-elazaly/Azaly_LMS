import { AuthorizationError } from '@/features/identity/policy';
import { requireRole } from '@/features/identity/session';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const user = await requireRole(['INSTRUCTOR'], request.headers);
    return Response.json({ user }, { headers });
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : 503;
    return Response.json({ error: status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'UNAVAILABLE' }, { status, headers });
  }
}
