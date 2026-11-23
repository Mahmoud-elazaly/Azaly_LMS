import { expect, it } from 'vitest';
import { importBankQuestion } from '../../src/features/assessment/policy';
import { canPublish } from '../../src/features/authoring/policy';
import { bankQuestions, courseDocument } from '../../src/features/curriculum/prometheus-grafana/course';
import { labFiles } from '../../src/features/curriculum/prometheus-grafana/lab-kit';

it('ships a complete bilingual course with the same executable examples in both locales', () => {
  expect(canPublish(courseDocument)).toBe(true);
  expect(courseDocument.modules).toHaveLength(7);
  const lessons = courseDocument.modules.flatMap((module) => module.lessons);
  expect(lessons).toHaveLength(14);
  const blocks = lessons.flatMap((lesson) => lesson.blocks).filter((block) => block.type === 'code');
  for (const { translations } of blocks) expect(translations.en).toBe(translations.ar);
  for (const file of Object.values(labFiles)) {
    expect(blocks.some(({ translations }) => translations.en === file)).toBe(true);
  }
  expect(courseDocument.guidedLabs?.map((lab) => lab.labMode)).toEqual(Array(4).fill('GUIDED'));
});

it('links every assessment to a distinct frozen bank copy with an aligned bilingual answer', () => {
  const quizzes = courseDocument.quizzes ?? [];
  expect(quizzes.map((quiz) => quiz.questions.length)).toEqual([3, 3, 3, 3]);
  const copies = quizzes.flatMap((quiz) => quiz.questions);
  expect(new Set(copies.map((copy) => copy.bankSource?.id)).size).toBe(bankQuestions.length);
  for (const item of bankQuestions) {
    const copy = copies.find((question) => question.bankSource?.id === item.id);
    if (!copy) throw new Error(`Missing published copy of bank question ${item.id}`);
    expect(copy.id).not.toBe(item.id);
    expect(copy).toEqual(importBankQuestion(item, copy.id));
  }
});
