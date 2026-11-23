import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bankContent, importBankQuestion, type BankQuestion } from '../../src/features/assessment/policy';
import { canManageAuthorContent, canPublish, documentSchema } from '../../src/features/authoring/policy';
import type { Role } from '../../src/features/identity/policy';
import { guidedProgressError, guidedReview, guidedSubmission, type GuidedLab, type GuidedSubmission } from '../../src/features/guided/policy';

const translations = {
  ar: { prompt: 'ما الملف؟', choices: ['ملف إعدادات', 'ملف سجل'], explanation: 'يحفظ الإعدادات.' },
  en: { prompt: 'Which file?', choices: ['Config', 'Log'], explanation: 'It stores configuration.' },
};

describe('author-owned question bank and publication copies', () => {
  it.each<[Role, string | null, boolean]>([
    ['INSTRUCTOR', 'author', true], ['INSTRUCTOR', 'another', false], ['INSTRUCTOR', null, false],
    ['STUDENT', 'author', false], ['ADMIN', 'another', true], ['OWNER', null, true],
  ])('scopes %s against content owned by %s', (role, owner, allowed) => {
    expect(canManageAuthorContent({ id: 'author', role }, owner)).toBe(allowed);
  });

  it('retains the imported key and explanations when the bank record changes', () => {
    const question: BankQuestion = {
      id: randomUUID(), version: 1, archived: false, correct: 0, tags: ['config'], translations: structuredClone(translations),
    };
    const imported = importBankQuestion(question, randomUUID());
    question.correct = 1;
    question.translations.en.choices[0] = 'Edited';
    question.translations.ar.explanation = 'شرح معدّل';
    question.tags.push('updated');
    expect(imported).toMatchObject({ correct: 0, translations, bankSource: { id: question.id, tags: ['config'] } });
    expect(() => importBankQuestion({ ...question, archived: true }, randomUUID())).toThrow();
  });

  it('keeps a single-locale course publishable when an imported bank copy includes both languages', () => {
    const question = importBankQuestion({ id: randomUUID(), archived: false, version: 1, tags: [], correct: 0, translations }, randomUUID());
    const document = documentSchema.parse({
      slug: 'course', position: 0, translations: { en: { title: 'Course', summary: 'Course summary' } },
      modules: [{ id: randomUUID(), titles: { en: 'Section' }, lessons: [{
        id: randomUUID(), titles: { en: 'Lesson' }, blocks: [{
          id: randomUUID(), type: 'paragraph', translations: { en: 'Read this.' },
        }],
      }] }],
      quizzes: [{ id: randomUUID(), titles: { en: 'Quiz' }, questions: [question] }],
    });
    expect(canPublish(document)).toBe(true);
    expect(bankContent.safeParse({ translations, correct: 2, tags: [] }).success).toBe(false);
  });
});

describe('Guided Lab transitions', () => {
  const checkpoint = randomUUID();
  const lab: GuidedLab = {
    id: randomUUID(), labMode: 'GUIDED', title: 'Lab', instructions: 'Read', commands: '', starter: '',
    checkpoints: [{ id: checkpoint, label: 'Check' }], evidencePrompt: null, attempt: null,
  };
  const submission: GuidedSubmission = {
    operation: 'complete', id: randomUUID(), labId: lab.id, locale: 'en',
    checkpointIds: [checkpoint], evidence: 'Output', completionProvenance: 'SELF_REPORTED',
  };

  it('allows progress, requires all known checkpoints for completion, and fixes submitted evidence', () => {
    expect(guidedProgressError(lab, { ...submission, operation: 'save', checkpointIds: [] })).toBeNull();
    expect(guidedProgressError(lab, { ...submission, checkpointIds: [] })).toBe(400);
    expect(guidedProgressError(lab, { ...submission, checkpointIds: [randomUUID()] })).toBe(400);
    expect(guidedProgressError(lab, submission)).toBeNull();
    const committed: GuidedLab = { ...lab, attempt: {
      id: randomUUID(), checkpointIds: [checkpoint], evidence: 'Output', completionProvenance: 'SELF_REPORTED',
      submittedAt: '2026-11-23T00:00:00Z', review: null,
    } };
    expect(guidedProgressError(committed, submission)).toBeNull();
    expect(guidedProgressError(committed, { ...submission, evidence: 'Replacement' })).toBe(409);
  });

  it.each(['INSTRUCTOR_REVIEWED', 'SYSTEM_VERIFIED'])('rejects learner provenance %s', (completionProvenance) => {
    expect(guidedSubmission.safeParse({ ...submission, completionProvenance }).success).toBe(false);
  });

  it('reserves the reviewer input for instructor outcomes', () => {
    const review = { attemptId: randomUUID(), decision: 'APPROVED', feedback: '' };
    expect(guidedReview.safeParse({ ...review, completionProvenance: 'INSTRUCTOR_REVIEWED' }).success).toBe(true);
    expect(guidedReview.safeParse({ ...review, completionProvenance: 'SYSTEM_VERIFIED' }).success).toBe(false);
  });
});
