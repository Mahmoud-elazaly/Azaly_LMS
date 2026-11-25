import { localeSchema, studentRoles } from '@/features/learning/policy';
import { LearningError } from '@/features/learning/service';
import { readMastery } from '@/features/mastery/service';
import { contentResponse } from '../content-response';

export function GET(request: Request) {
  return contentResponse(request, studentRoles, () => {
    const query = new URL(request.url).searchParams;
    const locale = localeSchema.safeParse(query.get('locale'));
    if (!locale.success || query.size !== 1) throw new LearningError(400);
    return readMastery(locale.data, request.headers);
  });
}
