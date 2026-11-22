import { z } from 'zod';

export const authorRoles = ['OWNER', 'ADMIN', 'INSTRUCTOR'] as const;
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
export const documentSchema = z.object({
  slug, position: z.number().int().min(0).max(100000),
  translations: localized(z.object({ title, summary: z.string().trim().max(3000) })),
  modules: z.array(moduleSchema).max(40),
}).superRefine((document, context) => {
  const ids = document.modules.flatMap((module) => [
    module.id, ...module.lessons.flatMap((lesson) => [lesson.id, ...lesson.blocks.map((block) => block.id)]),
  ]);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: 'Duplicate content IDs' });
  if (new TextEncoder().encode(JSON.stringify(document)).length > 350000) {
    context.addIssue({ code: 'custom', message: 'Draft is too large' });
  }
});

export type CourseDocument = z.infer<typeof documentSchema>;
export type CourseDraft = { id: string; version: number; visibility: 'draft' | 'published' | 'withdrawn'; document: CourseDocument };
export type BuilderCourse = Pick<CourseDraft, 'id'> & Pick<CourseDocument, 'slug' | 'translations'>;

export function canPublish(document: CourseDocument): boolean {
  const locales = (['ar', 'en'] as const).filter((locale) => {
    const translation = document.translations[locale];
    return Boolean(translation?.title.trim() || translation?.summary.trim());
  });
  return locales.length > 0 && document.modules.length > 0 && locales.every((locale) => {
    const translation = document.translations[locale];
    return translation?.title.trim() && translation.summary.trim() && document.modules.every((module) =>
      module.titles[locale]?.trim() && module.lessons.length > 0 && module.lessons.every((lesson) =>
        lesson.titles[locale]?.trim() && lesson.blocks.length > 0 &&
        lesson.blocks.every((block) => block.translations[locale]?.trim())));
  });
}

const existing = { id: z.uuid(), version: z.number().int().positive().max(2147483647) };
export const mutationSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('create'), slug }),
  z.object({ operation: z.literal('save'), ...existing, document: documentSchema }),
  z.object({ operation: z.enum(['publish', 'unpublish', 'archive']), ...existing }),
]);

export type Mutation = z.infer<typeof mutationSchema>;
