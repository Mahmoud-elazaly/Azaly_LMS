import { guidedCommand, learningCommand } from '../../db/learning';
import type { Locale } from '../../i18n/locales';
import { AuthorizationError } from '../identity/policy';
import { requireSession } from '../identity/session';
import { studentRoles, type LearnerInput } from './policy';
import type { GuidedLab } from '../guided/policy';
import type { LearnerQuestion } from '../assessment/policy';

export class LearningError extends Error {
  constructor(readonly status: 400 | 409) {
    super(status === 409 ? 'Attempt conflict' : 'Unavailable learning content or invalid submission');
  }
}

export type Enrollment = { id: string; title: string; localeAvailable: boolean; completed: number };
export type Grade = { id: string; quizId?: string; score: number; total: number; gradedAt: string };
export type Quiz = { id: string; title: string; questions: LearnerQuestion[] };
export type PlayerBlock = { id: string; type: 'heading' | 'paragraph' | 'code' | 'callout' | 'markdown'; text: string };
export type PlayerLesson = { id: string; title: string; blocks: PlayerBlock[] };
export type PlayerModule = { id: string; title: string; lessons: PlayerLesson[] };
export type PlayerData = {
  id: string;
  resumeLessonId: string | null;
  content: { title: string; modules: PlayerModule[] } | null;
  progress: { lessonId: string; completed: boolean; bookmarked: boolean }[];
  quizzes: Quiz[];
  grades: Grade[];
  guidedLabs: GuidedLab[];
};

export async function authorizeLearningResult<T>(command: Promise<T>) {
  try {
    return await command;
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code === '42501') throw new AuthorizationError(403);
    if (code === '22023' || code === '22P02') throw new LearningError(400);
    if (code === '23505' || code === '40001') throw new LearningError(409);
    throw error;
  }
}

function execute<T>(token: string, operation: string, id: string | null, locale: Locale, payload?: object) {
  return authorizeLearningResult(learningCommand<T>(token, operation, id, locale, payload));
}

export async function myEnrollments(locale: Locale, headers?: Headers) {
  const { token } = await requireSession(studentRoles, headers);
  return execute<Enrollment[]>(token, 'list', null, locale);
}

export async function readPlayer(id: string, locale: Locale, headers?: Headers) {
  const { token } = await requireSession(studentRoles, headers);
  const [player, guidedLabs] = await Promise.all([
    execute<Omit<PlayerData, 'guidedLabs'>>(token, 'read', id, locale),
    authorizeLearningResult(guidedCommand<GuidedLab[]>(token, { operation: 'read', id, locale })),
  ]);
  return { ...player, guidedLabs };
}

export async function changeLearning(input: LearnerInput, headers: Headers) {
  const { token } = await requireSession(studentRoles, headers);
  return execute<{ id?: string; ok?: boolean } | Grade>(token, input.operation, 'id' in input ? input.id : null, input.locale, input);
}
