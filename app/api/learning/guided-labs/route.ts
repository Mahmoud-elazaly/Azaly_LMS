import { guidedSubmission } from '@/features/guided/policy';
import { saveGuidedAttempt } from '@/features/guided/service';
import { studentRoles } from '@/features/learning/policy';
import { LearningError } from '@/features/learning/service';
import { contentResponse } from '../../content-response';

export function POST(request: Request) {
  return contentResponse(request, studentRoles, async () => {
    const input = guidedSubmission.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new LearningError(400);
    return saveGuidedAttempt(input.data, request.headers);
  });
}
