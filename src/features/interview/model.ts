import { z } from 'zod';

export const interviewTracks = ['linux', 'web-proxy', 'git-cicd', 'containers', 'observability', 'security', 'iac'] as const;
export const interviewRoles = ['sysadmin', 'devops', 'sre'] as const;
export const seniorities = ['junior', 'mid', 'senior'] as const;
export const interviewLimits = { turns: 4, answerBytes: 2400, inputTokens: 65536, outputTokens: 6144 } as const;

const scope = z.array(z.enum(interviewTracks)).min(1).max(interviewTracks.length)
  .refine((tracks) => new Set(tracks).size === tracks.length);
export const setupSchema = z.strictObject({
  role: z.enum(interviewRoles),
  seniority: z.enum(seniorities),
  tracks: scope,
  locale: z.enum(['ar', 'en']),
});
export const sessionVersion = z.strictObject({
  id: z.uuid(),
  turn: z.number().int().min(0).max(interviewLimits.turns),
});
export const answerBytes = (answer: string) => new TextEncoder().encode(answer).length;
export const messageSchema = sessionVersion.extend({
  answer: z.string().trim().min(1).refine((text) => !text.includes('\0') && answerBytes(text) <= interviewLimits.answerBytes),
});

const rating = z.number().int().min(0).max(100);
const conceptSlug = z.string().max(64).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
export const scorecardSchema = z.strictObject({
  overall_score: rating,
  technical_accuracy: rating,
  production_and_security_awareness: rating,
  missing_edge_cases: z.array(z.string().min(1).max(400)).max(6),
  model_answer: z.string().min(1).max(3500),
  weak_concept_slugs: z.array(conceptSlug).max(12),
});
export const questionSchema = z.strictObject({ question: z.string().min(1).max(1800) });
export type Scorecard = z.infer<typeof scorecardSchema>;
export type InterviewSetup = z.infer<typeof setupSchema>;
export type InterviewTrack = InterviewSetup['tracks'][number];
export type InterviewMessage = { speaker: 'interviewer' | 'learner'; text: string };
export type InterviewSummary = InterviewSetup & {
  id: string;
  turns: number;
  inputReserved: number;
  outputReserved: number;
  createdAt: string;
  completedAt: string | null;
};
export type InterviewSession = InterviewSummary & { messages: InterviewMessage[]; scorecard: Scorecard | null };

export function parseScorecard(content: unknown, concepts: ReadonlySet<string>) {
  const parsed = scorecardSchema.parse(content);
  const weak = parsed.weak_concept_slugs;
  if (new Set(weak).size !== weak.length || weak.some((slug) => !concepts.has(slug))) {
    throw new Error('Scorecard references invalid concepts');
  }
  return {
    ...parsed,
    model_answer: usableText(parsed.model_answer),
    missing_edge_cases: parsed.missing_edge_cases.map(usableText),
  };
}

export function usableText(text: string) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.includes('\0')) throw new Error('Invalid interview text');
  return trimmed;
}
