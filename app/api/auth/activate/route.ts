import { reportAuthFailure } from '@/features/identity/diagnostics';
import { activationInput } from '@/features/identity/directory';
import { AccountOperationError, activateInvitation } from '@/features/identity/management';
import { AuthorizationError } from '@/features/identity/policy';

const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const input = activationInput.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: 'INVALID_INPUT' }, { status: 400, headers });
  try {
    await activateInvitation(input.data.token, input.data.password, request.headers);
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    const status = error instanceof AccountOperationError || error instanceof AuthorizationError ? error.status : 503;
    if (status === 503) reportAuthFailure('Invitation activation', error);
    const code = error instanceof AccountOperationError ? error.code : status === 403 ? 'FORBIDDEN' : 'UNAVAILABLE';
    return Response.json({ error: code }, { status, headers });
  }
}
