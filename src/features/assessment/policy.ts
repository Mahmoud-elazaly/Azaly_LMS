import { z } from 'zod';

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const translation = z.strictObject({
  prompt: requiredText(160),
  choices: z.array(requiredText(300)).min(2).max(4),
  explanation: requiredText(2000),
});

export const bankContent = z.strictObject({
  translations: z.strictObject({ ar: translation, en: translation }),
  correct: z.number().int().min(0).max(3),
  tags: z.array(requiredText(40)).max(12),
}).refine(({ translations, correct }) =>
  translations.ar.choices.length === translations.en.choices.length && correct < translations.en.choices.length);

export type BankContent = z.infer<typeof bankContent>;
export type BankQuestion = BankContent & { id: string; version: number; archived: boolean };

const existing = { id: z.uuid(), version: z.number().int().positive().max(2147483647) };
export const bankMutation = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('create'), question: bankContent }),
  z.strictObject({ operation: z.literal('save'), ...existing, question: bankContent }),
  z.strictObject({ operation: z.literal('archive'), ...existing }),
]);

export function importBankQuestion(question: BankQuestion, occurrenceId: string) {
  if (question.archived) throw new Error('Archived question');
  const { id, correct, translations, tags } = question;
  return structuredClone({ id: occurrenceId, bankSource: { id, tags }, correct, translations });
}
