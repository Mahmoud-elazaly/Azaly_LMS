import { reviewCommand } from '../../db/authoring';
import { guidedCommand } from '../../db/learning';
import type { Locale } from '../../i18n/locales';
import { authorRoles, canManageAuthorContent } from '../authoring/policy';
import { authorizeAuthoringResult } from '../authoring/service';
import { requireSession } from '../identity/session';
import { AuthorizationError } from '../identity/policy';
import { studentRoles } from '../learning/policy';
import { authorizeLearningResult, LearningError } from '../learning/service';
import { guidedProgressError, type GuidedAttempt, type GuidedLab, type GuidedReviewInput, type GuidedSubmission, type ReviewEntry } from './policy';

export async function saveGuidedAttempt(input: GuidedSubmission, headers: Headers) {
  const { token } = await requireSession(studentRoles, headers);
  const { operation, locale, id, ...payload } = input;
  const labs = await authorizeLearningResult(guidedCommand<GuidedLab[]>(token, { operation: 'read', id, locale }));
  const lab = labs.find((entry) => entry.id === payload.labId);
  if (!lab) throw new AuthorizationError(403);
  const error = guidedProgressError(lab, input);
  if (error) throw new LearningError(error);
  return authorizeLearningResult(guidedCommand<GuidedAttempt>(token, { operation, locale, id }, payload));
}

export async function listGuidedReviews(locale: Locale, headers?: Headers) {
  const { token, principal } = await requireSession(authorRoles, headers);
  const entries = await authorizeAuthoringResult(reviewCommand<(ReviewEntry & { courseOwnerId: string | null })[]>(token, locale));
  return entries.map(({ courseOwnerId, ...entry }) => {
    if (!canManageAuthorContent(principal, courseOwnerId)) throw new AuthorizationError(403);
    return entry;
  });
}

export async function recordGuidedReview(locale: Locale, input: GuidedReviewInput, headers: Headers) {
  const { token, principal } = await requireSession(authorRoles, headers);
  const scope = await authorizeAuthoringResult(reviewCommand<{ courseOwnerId: string | null }>(token, locale, { attemptId: input.attemptId }));
  if (!canManageAuthorContent(principal, scope.courseOwnerId)) throw new AuthorizationError(403);
  return authorizeAuthoringResult(reviewCommand<GuidedAttempt>(token, locale, input));
}
