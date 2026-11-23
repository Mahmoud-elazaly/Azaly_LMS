import { z } from 'zod';
import { getAuth } from '@/features/identity/auth';
import { AuthorizationError } from '@/features/identity/policy';
import { requireRole } from '@/features/identity/session';
import { learnerInput, localeSchema, studentRoles } from '@/features/learning/policy';
import { changeLearning, LearningError, myEnrollments, readPlayer } from '@/features/learning/service';

const headers = { 'Cache-Control': 'no-store' };
function failure(error: unknown) {
  const status = error instanceof AuthorizationError || error instanceof LearningError ? error.status : 503;
  return Response.json({ error: status }, { status, headers });
}

export async function GET(request: Request) {
  try {
    await requireRole(studentRoles, request.headers);
    const query = new URL(request.url).searchParams;
    const locale = localeSchema.safeParse(query.get('locale'));
    const id = query.get('id');
    if (!locale.success || (id !== null && !z.uuid().safeParse(id).success)) throw new LearningError(400);
    const data = id ? await readPlayer(id, locale.data, request.headers) : await myEnrollments(locale.data, request.headers);
    return Response.json(data, { headers });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(studentRoles, request.headers);
    if (request.headers.get('origin') !== getAuth().origin) throw new AuthorizationError(403);
    const parsed = learnerInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new LearningError(400);
    return Response.json(await changeLearning(parsed.data, request.headers), { headers });
  } catch (error) {
    return failure(error);
  }
}
