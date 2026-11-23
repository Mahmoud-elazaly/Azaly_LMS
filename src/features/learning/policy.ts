import { z } from 'zod';
import { slug } from '../authoring/policy';

export const studentRoles = ['STUDENT'] as const;
export const localeSchema = z.enum(['ar', 'en']);
const scope = { locale: localeSchema, id: z.uuid() };
export const learnerInput = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('enroll'), locale: localeSchema, slug }),
  z.strictObject({ operation: z.enum(['resume', 'complete']), ...scope, lessonId: z.uuid() }),
  z.strictObject({ operation: z.literal('bookmark'), ...scope, lessonId: z.uuid(), bookmarked: z.boolean() }),
  z.strictObject({ operation: z.literal('submit'), ...scope, quizId: z.uuid(), attemptId: z.uuid(),
    answers: z.record(z.uuid(), z.union([
      z.number().int().min(0).max(3),
      z.array(z.number().int().min(1).max(120)).min(1).max(120)
        .refine((lines) => new Set(lines).size === lines.length),
      z.string().max(512).refine((answer) => Boolean(answer.trim()) && !/[\r\n]/.test(answer)),
    ])).refine((answers) => {
      const count = Object.keys(answers).length;
      return count > 0 && count <= 20;
    }),
  }),
]);

export type LearnerInput = z.infer<typeof learnerInput>;

export function progressPercent(completed: number, total: number): number {
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}
