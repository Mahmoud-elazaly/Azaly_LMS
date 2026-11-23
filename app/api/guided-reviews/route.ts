import { authorRoles } from '@/features/authoring/policy';
import { AuthoringError } from '@/features/authoring/service';
import { guidedReview } from '@/features/guided/policy';
import { listGuidedReviews, recordGuidedReview } from '@/features/guided/service';
import { isLocale } from '@/i18n/locales';
import { contentResponse } from '../content-response';

function reviewLocale(request: Request) {
  const locale = new URL(request.url).searchParams.get('locale');
  if (locale === null || !isLocale(locale)) throw new AuthoringError(400);
  return locale;
}

export function GET(request: Request) {
  return contentResponse(request, authorRoles, () => listGuidedReviews(reviewLocale(request), request.headers));
}

export function POST(request: Request) {
  return contentResponse(request, authorRoles, async () => {
    const input = guidedReview.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new AuthoringError(400);
    return recordGuidedReview(reviewLocale(request), input.data, request.headers);
  });
}
