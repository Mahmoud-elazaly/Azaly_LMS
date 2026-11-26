import { readRequestJson } from '@/lib/limited-json';
import { getAuth } from '@/features/identity/auth';
import { AuthorizationError } from '@/features/identity/policy';
import { requireSession } from '@/features/identity/session';
import { studentRoles } from '@/features/learning/policy';
import { labRequest } from '@/features/real-lab/policy';
import { changeRealLab, readRealLab, RealLabError } from '@/features/real-lab/service';

const headers = { 'Cache-Control': 'no-store' };

function failure(error: unknown) {
  const status = error instanceof AuthorizationError || error instanceof RealLabError ? error.status : 503;
  return Response.json({ error: status }, { status, headers });
}

export async function GET(request: Request) {
  try {
    return Response.json(await readRealLab(request.headers), { headers });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { token } = await requireSession(studentRoles, request.headers);
    if (request.headers.get('origin') !== getAuth().origin) throw new AuthorizationError(403);
    const input = labRequest.safeParse(await readRequestJson(request, 2048));
    if (!input.success) throw new RealLabError(400);
    return Response.json(await changeRealLab(input.data, token), { headers });
  } catch (error) {
    return failure(error);
  }
}
