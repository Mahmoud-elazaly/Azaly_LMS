import { describe, expect, it } from 'vitest';
import { authorizeRole, canAssignRole, isRole } from '../../src/features/identity/policy';

describe('identity role policy', () => {
  it('rejects unauthenticated and out-of-scope calls at different boundaries', () => {
    expect(() => authorizeRole(null, ['OWNER', 'ADMIN'])).toThrow(expect.objectContaining({ status: 401 }));
    expect(() => authorizeRole('INSTRUCTOR', ['OWNER', 'ADMIN'])).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => authorizeRole('STUDENT', ['INSTRUCTOR'])).toThrow(expect.objectContaining({ status: 403 }));
    expect(authorizeRole('OWNER', ['OWNER', 'ADMIN'])).toBe('OWNER');
  });

  it('accepts only single canonical roles', () => {
    expect(isRole('OWNER')).toBe(true);
    expect(isRole('owner')).toBe(false);
    expect(isRole('STUDENT,OWNER')).toBe(false);
  });

  it('keeps Owner creation outside role assignment and limits Admin scope', () => {
    expect(canAssignRole('OWNER', 'STUDENT', 'ADMIN')).toBe(true);
    expect(canAssignRole('OWNER', 'OWNER', 'STUDENT')).toBe(false);
    expect(canAssignRole('ADMIN', 'ADMIN', 'OWNER')).toBe(false);
    expect(canAssignRole('ADMIN', 'STUDENT', 'ADMIN')).toBe(false);
    expect(canAssignRole('ADMIN', 'STUDENT', 'INSTRUCTOR')).toBe(true);
    expect(canAssignRole('INSTRUCTOR', 'STUDENT', 'INSTRUCTOR')).toBe(false);
  });
});

describe('account return paths', () => {
  it('rejects external, encoded, and cross-locale destinations', async () => {
    const { returnPath } = await import('../../src/features/identity/return-path');
    expect(returnPath('ar', '/ar/profile')).toBe('/ar/profile');
    const selected = '/ar/learning?id=1800ab00-20de-4c60-8175-55db381a66bc';
    expect(returnPath('ar', selected)).toBe(selected);
    expect(returnPath('ar', '/ar/courses/linux-101')).toBe('/ar/courses/linux-101');
    for (const value of [selected + '&next=/ar/admin', '/ar/learning?id=invalid', '/ar/courses/..', '//evil.test', '/ar/%2f%2fevil.test', '/en/profile', '/ar/profile/extra', ['profile']]) {
      expect(returnPath('ar', value)).toBe('/ar/dashboard');
    }
  });
});
