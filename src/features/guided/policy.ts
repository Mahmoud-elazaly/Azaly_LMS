import { z } from 'zod';

const localizedText = (max: number) => z.strictObject({
  ar: z.string().max(max).optional(),
  en: z.string().max(max).optional(),
});

export const guidedTemplate = z.strictObject({
  id: z.uuid(),
  labMode: z.literal('GUIDED').default('GUIDED'),
  titles: localizedText(160),
  instructions: localizedText(6000),
  commands: z.string().max(12000),
  starter: z.string().max(12000),
  checkpoints: z.array(z.strictObject({ id: z.uuid(), labels: localizedText(300) })).max(30),
  evidencePrompt: localizedText(1200),
});
export type GuidedTemplate = z.infer<typeof guidedTemplate>;

export function readyToPublishLab(lab: GuidedTemplate) {
  return lab.checkpoints.length > 0 && (['ar', 'en'] as const).every((locale) =>
    lab.titles[locale]?.trim() && lab.instructions[locale]?.trim() &&
    lab.checkpoints.every((checkpoint) => checkpoint.labels[locale]?.trim()));
}

export const guidedSubmission = z.strictObject({
  operation: z.enum(['save', 'complete']),
  id: z.uuid(),
  locale: z.enum(['ar', 'en']),
  labId: z.uuid(),
  completionProvenance: z.literal('SELF_REPORTED'),
  checkpointIds: z.array(z.uuid()).max(30).refine((ids) => new Set(ids).size === ids.length),
  evidence: z.string().trim().max(4000),
});

export const guidedReview = z.strictObject({
  attemptId: z.uuid(),
  completionProvenance: z.literal('INSTRUCTOR_REVIEWED'),
  decision: z.enum(['APPROVED', 'NOT_APPROVED']),
  feedback: z.string().trim().max(2000),
});

export type GuidedSubmission = z.infer<typeof guidedSubmission>;
export type GuidedReviewInput = z.infer<typeof guidedReview>;
export type GuidedReview = Pick<GuidedReviewInput, 'completionProvenance' | 'decision' | 'feedback'> & { reviewedAt: string };
export type GuidedAttempt = {
  id: string;
  checkpointIds: string[];
  evidence: string;
  completionProvenance: 'SELF_REPORTED' | null;
  submittedAt: string | null;
  review: GuidedReview | null;
};
export type GuidedLab = Pick<GuidedTemplate, 'id' | 'labMode' | 'commands' | 'starter'> & {
  title: string;
  instructions: string;
  checkpoints: { id: string; label: string }[];
  evidencePrompt: string | null;
  attempt: GuidedAttempt | null;
};

export function guidedProgressError(lab: GuidedLab, submission: GuidedSubmission): 400 | 409 | null {
  const ids = new Set(submission.checkpointIds);
  const matching = lab.checkpoints.filter(({ id }) => ids.has(id)).length;
  if (matching !== submission.checkpointIds.length ||
    (submission.operation === 'complete' && matching !== lab.checkpoints.length)) return 400;
  if (lab.attempt?.submittedAt && (submission.operation !== 'complete' || submission.evidence !== lab.attempt.evidence)) return 409;
  return null;
}
export type ReviewEntry = {
  attempt: GuidedAttempt;
  title: string;
  course: string;
  learner: string;
  checkpoints: { id: string; label: string }[];
};
