import { AuthoringError } from '@/features/authoring/service';
import { getAuth } from '@/features/identity/auth';
import { AuthorizationError, type Role } from '@/features/identity/policy';
import { requireRole } from '@/features/identity/session';
import { LearningError } from '@/features/learning/service';

export async function contentResponse(request: Request, roles: readonly Role[], operation: () => Promise<unknown>) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await requireRole(roles, request.headers);
    if (request.method === 'POST' && request.headers.get('origin') !== getAuth().origin) throw new AuthorizationError(403);
    return Response.json(await operation(), { headers });
  } catch (error) {
    const status = error instanceof AuthorizationError || error instanceof AuthoringError || error instanceof LearningError
      ? error.status : 503;
    return Response.json({ error: status }, { status, headers });
  }
}
