import { reportAuthFailure } from '@/features/identity/diagnostics';
import { directoryFilters, managementInput } from '@/features/identity/directory';
import { AccountOperationError, listUsers, managers, manageUser } from '@/features/identity/management';
import { AuthorizationError } from '@/features/identity/policy';
import { requireRole } from '@/features/identity/session';

const headers = { 'Cache-Control': 'no-store' };

function failure(error: unknown) {
  const status = error instanceof AuthorizationError || error instanceof AccountOperationError ? error.status : 503;
  if (status === 503 && !(error instanceof AccountOperationError)) reportAuthFailure('User management', error);
  const code = error instanceof AccountOperationError ? error.code :
    status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'UNAVAILABLE';
  return Response.json({ error: code }, { status, headers });
}

export async function GET(request: Request) {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    return Response.json(await listUsers(request.headers, directoryFilters(query)), { headers });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(managers, request.headers);
    const input = managementInput.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: 'INVALID_INPUT' }, { status: 400, headers });
    const result = await manageUser(input.data, request.headers);
    return Response.json(result, { status: 'delivery' in result && result.delivery === 'failed' ? 202 : 200, headers });
  } catch (error) {
    return failure(error);
  }
}
