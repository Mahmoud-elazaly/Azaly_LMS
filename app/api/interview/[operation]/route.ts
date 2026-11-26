import { z } from 'zod';
import { getAuth } from '@/features/identity/auth';
import { AuthorizationError } from '@/features/identity/policy';
import { requireSession } from '@/features/identity/session';
import { InterviewError } from '@/features/interview/gemini';
import { messageSchema, sessionVersion, setupSchema } from '@/features/interview/model';
import { advanceInterview, interviewDetails, interviewHistory } from '@/features/interview/service';
import { studentRoles } from '@/features/learning/policy';
import { LearningError } from '@/features/learning/service';
import { readLimitedJson } from '@/lib/limited-json';

const headers = { 'Cache-Control': 'no-store' };
const historyQuery = z.union([
  z.strictObject({ id: z.uuid() }),
  z.strictObject({ before: z.uuid().optional() }),
]);

async function respond(operation: () => Promise<unknown>) {
  try {
    return Response.json(await operation(), { headers });
  } catch (error) {
    const status = error instanceof AuthorizationError || error instanceof LearningError || error instanceof InterviewError
      ? error.status : error instanceof z.ZodError ? 400 : 503;
    return Response.json({ error: status }, { status, headers });
  }
}

export function GET(request: Request, { params }: RouteContext<'/api/interview/[operation]'>) {
  return respond(async () => {
    const { token } = await requireSession(studentRoles, request.headers);
    if ((await params).operation !== 'history') throw new InterviewError(404);
    const search = new URL(request.url).searchParams;
    if (search.size > 1) throw new InterviewError(400);
    const query = historyQuery.parse(Object.fromEntries(search));
    return 'id' in query ? interviewDetails(token, query.id) : interviewHistory(token, query.before ?? null);
  });
}

export function POST(request: Request, { params }: RouteContext<'/api/interview/[operation]'>) {
  return respond(async () => {
    const { token } = await requireSession(studentRoles, request.headers);
    if (request.headers.get('origin') !== getAuth().origin) throw new AuthorizationError(403);
    const { operation } = await params;
    if (operation !== 'start' && operation !== 'message' && operation !== 'evaluate') throw new InterviewError(404);
    const body = await readLimitedJson(request, 16384).catch(() => { throw new InterviewError(400); });
    switch (operation) {
      case 'start': return advanceInterview(token, { action: operation, ...setupSchema.parse(body) });
      case 'message': return advanceInterview(token, { action: operation, ...messageSchema.parse(body) });
      case 'evaluate': return advanceInterview(token, { action: operation, ...sessionVersion.parse(body) });
    }
  });
}
