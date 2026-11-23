import { z } from 'zod';
import { guidedTemplate, readyToPublishLab } from '../guided/policy.ts';
import type { Role } from '../identity/policy';

export const authorRoles = ['OWNER', 'ADMIN', 'INSTRUCTOR'] as const;
export function canManageAuthorContent(actor: { id: string; role: Role }, ownerId: string | null) {
  return actor.role === 'OWNER' || actor.role === 'ADMIN' || (actor.role === 'INSTRUCTOR' && actor.id === ownerId);
}
export const slug = z.string().max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const title = z.string().trim().max(160);
const localized = <T extends z.ZodType>(value: T) => z.object({ ar: value.optional(), en: value.optional() });
const block = z.object({
  id: z.uuid(),
  type: z.enum(['paragraph', 'heading', 'code', 'callout']),
  translations: localized(z.string().max(12000)),
});
const lesson = z.object({ id: z.uuid(), titles: localized(title), blocks: z.array(block).max(50) });
const moduleSchema = z.object({ id: z.uuid(), titles: localized(title), lessons: z.array(lesson).max(40) });
const question = z.object({
  id: z.uuid(),
  correct: z.number().int().min(0).max(3),
  translations: localized(z.object({
    prompt: title,
    choices: z.array(z.string().trim().max(300)).min(2).max(4),
    explanation: z.string().max(2000).optional(),
  })),
  bankSource: z.strictObject({ id: z.uuid(), tags: z.array(z.string().max(40)).max(12) }).optional(),
});
const quiz = z.object({ id: z.uuid(), titles: localized(title), questions: z.array(question).max(20) });
export const documentSchema = z.strictObject({
  slug, position: z.number().int().min(0).max(100000),
  translations: localized(z.object({ title, summary: z.string().trim().max(3000) })),
  modules: z.array(moduleSchema).max(40),
  quizzes: z.array(quiz).max(10).optional(),
  guidedLabs: z.array(guidedTemplate).max(20).optional(),
}).superRefine((document, context) => {
  const ids = document.modules.flatMap((courseModule) => [
    courseModule.id, ...courseModule.lessons.flatMap((lesson) => [lesson.id, ...lesson.blocks.map((block) => block.id)]),
  ]);
  ids.push(...(document.quizzes ?? []).flatMap((quiz) => [quiz.id, ...quiz.questions.map((question) => question.id)]));
  ids.push(...(document.guidedLabs ?? []).flatMap((lab) => [lab.id, ...lab.checkpoints.map((step) => step.id)]));
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: 'Duplicate content IDs' });
  if (new TextEncoder().encode(JSON.stringify(document)).length > 350000) {
    context.addIssue({ code: 'custom', message: 'Draft is too large' });
  }
});

export type CourseDocument = z.infer<typeof documentSchema>;
export type CourseDraft = { id: string; version: number; visibility: 'draft' | 'published' | 'withdrawn'; document: CourseDocument };
export type BuilderCourse = Pick<CourseDraft, 'id'> & Pick<CourseDocument, 'slug' | 'translations'>;

export function canPublish(document: CourseDocument): boolean {
  if (!(document.guidedLabs ?? []).every(readyToPublishLab)) return false;
  const locales = (['ar', 'en'] as const).filter((locale) => {
    const translation = document.translations[locale];
    if (translation?.title.trim() || translation?.summary.trim()) return true;
    const hasLessonText = document.modules.some((courseModule) => courseModule.titles[locale]?.trim() ||
      courseModule.lessons.some((lesson) => lesson.titles[locale]?.trim() ||
        lesson.blocks.some((block) => block.translations[locale]?.trim())));
    return hasLessonText || (document.quizzes ?? []).some((quiz) => quiz.titles[locale]?.trim() ||
      quiz.questions.some((question) => {
        if (question.bankSource) return false;
        const text = question.translations[locale];
        return text?.prompt.trim() || text?.choices.some((choice) => choice.trim());
      }));
  });
  return locales.length > 0 && document.modules.length > 0 && locales.every((locale) => {
    const translation = document.translations[locale];
    const lessonsComplete = document.modules.every((courseModule) =>
      courseModule.titles[locale]?.trim() && courseModule.lessons.length > 0 && courseModule.lessons.every((lesson) =>
        lesson.titles[locale]?.trim() && lesson.blocks.length > 0 &&
        lesson.blocks.every((block) => block.translations[locale]?.trim())));
    const quizzesComplete = (document.quizzes ?? []).every((quiz) =>
      quiz.titles[locale]?.trim() && quiz.questions.length > 0 && quiz.questions.every((question) => {
        const text = question.translations[locale];
        return text?.prompt.trim() && text.choices.every((choice) => choice.trim()) && question.correct < text.choices.length;
      }));
    return translation?.title.trim() && translation.summary.trim() && lessonsComplete && quizzesComplete;
  });
}

const existing = { id: z.uuid(), version: z.number().int().positive().max(2147483647) };
export const mutationSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('create'), slug }),
  z.strictObject({ operation: z.literal('save'), ...existing, document: documentSchema }),
  z.strictObject({ operation: z.enum(['publish', 'unpublish', 'archive']), ...existing }),
]);

export type Mutation = z.infer<typeof mutationSchema>;
