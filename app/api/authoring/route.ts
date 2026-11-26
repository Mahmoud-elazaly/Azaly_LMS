import { readRequestJson } from '@/lib/limited-json';
import { z } from 'zod';
import { authorRoles, mutationSchema } from '@/features/authoring/policy';
import { AuthoringError, changeDraft, listCourses, readDraft } from '@/features/authoring/service';
import { getAuth } from '@/features/identity/auth';
import { AuthorizationError } from '@/features/identity/policy';
import { requireRole } from '@/features/identity/session';

const headers = { 'Cache-Control': 'no-store' };
function failure(error: unknown) {
  const status = error instanceof AuthorizationError || error instanceof AuthoringError ? error.status : 503;
  return Response.json({ error: status }, { status, headers });
}

export async function GET(request: Request) {
  try {
    await requireRole(authorRoles, request.headers);
    const id = new URL(request.url).searchParams.get('id');
    if (id && !z.uuid().safeParse(id).success) throw new AuthoringError(400);
    return Response.json(id ? await readDraft(id, request.headers) : await listCourses(request.headers), { headers });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(authorRoles, request.headers);
    if (request.headers.get('origin') !== getAuth().origin) throw new AuthorizationError(403);
    const parsed = mutationSchema.safeParse(await readRequestJson(request, 3 * 1024 * 1024));
    if (!parsed.success) throw new AuthoringError(400);
    return Response.json(await changeDraft(parsed.data, request.headers), { headers });
  } catch (error) {
    return failure(error);
  }
}
