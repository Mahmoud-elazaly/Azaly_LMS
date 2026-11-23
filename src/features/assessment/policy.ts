import { z } from 'zod';

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const localized = <T extends z.ZodType>(translation: T) => z.strictObject({ ar: translation, en: translation });
const draftLocalized = <T extends z.ZodType>(translation: T) =>
  z.object({ ar: translation.optional(), en: translation.optional() });
const prompt = z.string().trim().max(160);
const choices = z.array(z.string().trim().max(300)).min(2).max(4);
const translation = z.strictObject({ prompt: requiredText(160), explanation: requiredText(2000) });
const draftTranslation = z.object({ prompt, explanation: z.string().max(2000).optional() });
const requiredChoices = z.array(requiredText(300)).min(2).max(4);
const multipleChoice = { type: z.literal('mcq').optional(), correct: z.number().int().min(0).max(3) };
export const snippetLanguages = ['config', 'yaml', 'dockerfile', 'promql', 'nginx'] as const;
const bugQuestion = {
  type: z.literal('find_bug'),
  language: z.enum(snippetLanguages),
  snippet: z.string().min(1).max(8000),
  faultyLines: z.array(z.number().int().min(1).max(120)).min(1).max(120),
};
export const recallModes = ['exact', 'flags', 'regex'] as const;
function validRecallPattern(value: string) {
  if (value.length > 200 || /\(\?|\\[0-9]/.test(value)) return false;
  try {
    new RegExp(value, 'u');
    return true;
  } catch {
    return false;
  }
}

const cliQuestion = {
  type: z.literal('cli_recall'),
  rule: z.strictObject({ mode: z.enum(recallModes), value: requiredText(512) }).refine(({ mode, value }) =>
    !/[\r\n]/.test(value) && (mode !== 'regex' || validRecallPattern(value))),
};
const tags = z.array(requiredText(40)).max(12);
const occurrence = { id: z.uuid(), bankSource: z.strictObject({ id: z.uuid(), tags }).optional() };

export function snippetLines(snippet: string) {
  return snippet.replace(/\r\n?/g, '\n').split('\n');
}

function validBug({ snippet, faultyLines }: { snippet: string; faultyLines: number[] }) {
  const count = snippetLines(snippet).length;
  return Boolean(snippet.trim()) && count <= 120 && new Set(faultyLines).size === faultyLines.length &&
    faultyLines.every((line) => line <= count);
}

export const mcqBankContent = z.strictObject({
  ...multipleChoice, translations: localized(translation.extend({ choices: requiredChoices })), tags,
}).refine(({ translations, correct }) =>
  translations.ar.choices.length === translations.en.choices.length && correct < translations.en.choices.length);

export const bankContent = z.union([
  mcqBankContent,
  z.strictObject({ ...bugQuestion, translations: localized(translation), tags }).refine(validBug),
  z.strictObject({ ...cliQuestion, translations: localized(translation), tags }),
]);

export const draftQuestion = z.union([
  z.object({
    ...occurrence, ...multipleChoice, translations: draftLocalized(draftTranslation.extend({ choices })),
  }),
  z.strictObject({ ...occurrence, ...bugQuestion, translations: draftLocalized(draftTranslation) }).refine(validBug),
  z.strictObject({ ...occurrence, ...cliQuestion, translations: draftLocalized(draftTranslation) }),
]);

export type DraftQuestion = z.infer<typeof draftQuestion>;
export type BankContent = z.infer<typeof bankContent>;
export type BankQuestion = BankContent & { id: string; version: number; archived: boolean };
export type LearnerQuestion =
  | { type?: 'mcq'; id: string; prompt: string; choices: string[] }
  | { type: 'find_bug'; id: string; prompt: string; language: typeof snippetLanguages[number]; snippet: string }
  | { type: 'cli_recall'; id: string; prompt: string };
export type LearnerAnswer = number | number[] | string;

const existing = { id: z.uuid(), version: z.number().int().positive().max(2147483647) };
export const bankMutation = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('create'), question: bankContent }),
  z.strictObject({ operation: z.literal('save'), ...existing, question: bankContent }),
  z.strictObject({ operation: z.literal('archive'), ...existing }),
]);

export function importBankQuestion(question: BankQuestion, occurrenceId: string): DraftQuestion {
  if (question.archived) throw new Error('Archived question');
  const source = { id: occurrenceId, bankSource: { id: question.id, tags: question.tags } };
  if (question.type === 'find_bug') {
    return structuredClone({ ...source, type: question.type, translations: question.translations,
      language: question.language, snippet: question.snippet, faultyLines: question.faultyLines });
  }
  if (question.type === 'cli_recall') {
    return structuredClone({ ...source, type: question.type, translations: question.translations, rule: question.rule });
  }
  return structuredClone({ ...source, ...(question.type ? { type: question.type } : {}),
    correct: question.correct, translations: question.translations });
}
