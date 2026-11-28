import { expect, it } from 'vitest';
import { returnPath } from '../../src/features/identity/return-path';
import { labTemplates, parseLabConfiguration, realLabHref, starterConfiguration, templateVersions } from '../../src/features/real-lab/catalog';
import { labRequest } from '../../src/features/real-lab/policy';
import { calculateMastery } from '../../src/features/mastery/calculate';
import type { ConceptEvidence } from '../../src/features/mastery/model';

const id = '8f972555-219d-4b0e-a8c3-137c978a8604';

it('accepts only the versioned catalog at launch and preserves the unqualified NGINX launch', () => {
  expect(labRequest.parse({ operation: 'start', requestId: id })).toEqual({ operation: 'start', requestId: id });
  for (const version of templateVersions) {
    expect(labRequest.parse({ operation: 'start', requestId: id, templateVersion: version })).toHaveProperty('templateVersion', version);
    expect(parseLabConfiguration(starterConfiguration(version), version)).toEqual({ version, choice: labTemplates[version].starter });
  }
  expect(labRequest.safeParse({ operation: 'start', requestId: id, templateVersion: 'constructor' }).success).toBe(false);
  expect(labRequest.safeParse({ operation: 'config', id, templateVersion: templateVersions[1] }).success).toBe(false);
});

it.each([
  ['linux-file-permissions@1', 'umask 077', 'private'],
  ['prometheus-exposition@1', 'environment=production', 'production'],
] as const)('normalizes only the fixed setting for %s', (version, input, choice) => {
  expect(parseLabConfiguration(input, version)).toEqual({ version, choice });
  expect(parseLabConfiguration(`${input}\n# extra`, version)).toBeNull();
  expect(parseLabConfiguration(`${input.padStart(97)}`, version)).toBeNull();
  expect(parseLabConfiguration('proxy_pass http://127.0.0.1:8081;', version)).toBeNull();
});

it('counts verified completion for its linked concept and preserves the other track in the remediation queue', () => {
  const concepts: ConceptEvidence[] = [
    { slug: 'linux-file-permissions', track: 'linux-os', titles: { en: 'Permissions', ar: 'الأذونات' },
      summaries: { en: 'File modes', ar: 'أوضاع الملفات' },
      items: [{ kind: 'real', id: 'linux-file-permissions@1', provenance: 'SYSTEM_VERIFIED' }] },
    { slug: 'prometheus-exposition', track: 'observability', titles: { en: 'Exposition', ar: 'عرض المقاييس' },
      summaries: { en: 'Live metrics', ar: 'المقاييس الفعليّة' },
      items: [{ kind: 'real', id: 'prometheus-exposition@1', provenance: null }] },
  ];
  const evidence = { concepts, edges: [] };
  expect(calculateMastery(evidence, true)).toMatchObject({
    tracks: expect.arrayContaining([
      expect.objectContaining({ track: 'linux-os', score: 100, mastered: 1 }),
      expect.objectContaining({ track: 'observability', score: 0, mastered: 0 }),
    ]),
    weakest: [expect.objectContaining({ slug: 'prometheus-exposition', action: { kind: 'real', id: 'prometheus-exposition@1', provenance: null } })],
  });
  expect(calculateMastery(evidence, false)).toMatchObject({
    concepts: [expect.objectContaining({ score: 100 }), expect.objectContaining({ score: null })],
    weakest: [],
  });
});

it('keeps the selected lab after sign-in only for canonical local destinations', () => {
  const selected = realLabHref('ar', 'prometheus-exposition@1');
  expect(returnPath('ar', selected)).toBe(selected);
  expect(returnPath('ar', '/ar/real-lab?template=unknown%401')).toBe('/ar/dashboard');
  expect(returnPath('ar', `${selected}&next=https://example.test`)).toBe('/ar/dashboard');
});
