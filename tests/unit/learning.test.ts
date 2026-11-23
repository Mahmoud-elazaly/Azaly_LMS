import { describe, expect, it } from 'vitest';
import { learnerInput, progressPercent, studentRoles } from '../../src/features/learning/policy';
import { authorizeRole } from '../../src/features/identity/policy';

const id = '1800ab00-20de-4c60-8175-55db381a66bc';

describe('learner boundaries', () => {
  it('requires the Student role and derives ownership without any submitted student ID', () => {
    expect(authorizeRole('STUDENT', studentRoles)).toBe('STUDENT');
    expect(() => authorizeRole(null, studentRoles)).toThrow(expect.objectContaining({ status: 401 }));
    expect(() => authorizeRole('INSTRUCTOR', studentRoles)).toThrow(expect.objectContaining({ status: 403 }));
    const enrollment = { operation: 'enroll', locale: 'ar', slug: 'linux-administration' };
    expect(learnerInput.safeParse(enrollment).success).toBe(true);
    expect(learnerInput.safeParse({ ...enrollment, studentId: id }).success).toBe(false);
    expect(learnerInput.safeParse({ ...enrollment, slug: '../private' }).success).toBe(false);
  });

  it('validates version-scoped lesson operations and computes completion percentage', () => {
    expect(learnerInput.safeParse({ operation: 'complete', locale: 'en', id, lessonId: id }).success).toBe(true);
    expect(learnerInput.safeParse({ operation: 'complete', locale: 'en', id, lessonId: 'invalid' }).success).toBe(false);
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(2, 3)).toBe(67);
  });

  it('accepts answer choices and refuses browser grades or out-of-range choices', () => {
    const submission = { operation: 'submit', locale: 'en', id, quizId: id, attemptId: id, answers: { [id]: 1 } };
    expect(learnerInput.safeParse(submission).success).toBe(true);
    expect(learnerInput.safeParse({ ...submission, score: 100 }).success).toBe(false);
    expect(learnerInput.safeParse({ ...submission, answers: { [id]: 5 } }).success).toBe(false);
    expect(learnerInput.safeParse({ ...submission, answers: {} }).success).toBe(false);
  });
});
