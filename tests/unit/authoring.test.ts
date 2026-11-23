import { describe, expect, it } from 'vitest';
import { authorRoles, canPublish, documentSchema, mutationSchema, type CourseDocument } from '../../src/features/authoring/policy';
import { authorizeRole } from '../../src/features/identity/policy';

function sample(): CourseDocument {
  return {
    slug: 'linux-administration', position: 0, translations: { en: { title: 'Linux', summary: 'Introduction' } },
    modules: [{ id: '1800ab00-20de-4c60-8175-55db381a66bc', titles: { en: 'Files' }, lessons: [{
      id: '1800ab00-20de-4c60-8175-55db381a66bd', titles: { en: 'Permissions' }, blocks: [{
        id: '1800ab00-20de-4c60-8175-55db381a66be', type: 'code', translations: { en: 'ls -l' },
      }],
    }] }],
  };
}

describe('authoring boundaries', () => {
  it('allows author roles and denies guest and Student access', () => {
    for (const role of authorRoles) expect(authorizeRole(role, authorRoles)).toBe(role);
    expect(() => authorizeRole('STUDENT', authorRoles)).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => authorizeRole(null, authorRoles)).toThrow(expect.objectContaining({ status: 401 }));
  });

  it('accepts a monolingual publication but requires complete content for each started translation', () => {
    const document = sample();
    expect(documentSchema.safeParse(document).success).toBe(true);
    expect(canPublish(document)).toBe(true);
    document.modules[0].lessons[0].blocks[0].translations.ar = 'ls -l';
    expect(canPublish(document)).toBe(false);
    document.translations.ar = { title: 'لينكس', summary: 'مقدمة' };
    expect(canPublish(document)).toBe(false);
    const courseModule = document.modules[0];
    courseModule.titles.ar = 'ملفات';
    courseModule.lessons[0].titles.ar = 'الصلاحيات';
    courseModule.lessons[0].blocks[0].translations.ar = 'ls -l';
    expect(canPublish(document)).toBe(true);
  });

  it('rejects malformed slugs, stale-write bypasses, and duplicate IDs', () => {
    expect(mutationSchema.safeParse({ operation: 'create', slug: '<script>' }).success).toBe(false);
    expect(mutationSchema.safeParse({ operation: 'publish', id: sample().modules[0].id }).success).toBe(false);
    const document = sample();
    document.modules.push(document.modules[0]);
    expect(documentSchema.safeParse(document).success).toBe(false);
  });
});
