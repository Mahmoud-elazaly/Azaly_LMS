import { describe, expect, it } from 'vitest';
import { calculateMastery, weightedMasteryScore } from '../../src/features/mastery/calculate';
import { graphLayout } from '../../src/features/mastery/graph-layout';
import { validEdge, type ConceptEvidence, type Material } from '../../src/features/mastery/model';

const lesson = { kind: 'lesson', id: 'lesson', title: 'Read requests', courseSlug: 'http', courseTitle: 'HTTP', enrollmentId: 'enrolled' } as const;
const quiz = { ...lesson, kind: 'quiz', id: 'quiz', attempted: false, correctCount: 0, total: 2 } as const;
const guided = { ...lesson, kind: 'guided', id: 'lab', provenance: null, review: null } as const;
const real = { kind: 'real', id: 'nginx-reverse-proxy@1', provenance: null } as const;
function concept(slug: string, items: Material[]): ConceptEvidence {
  return { slug, track: 'observability', titles: { en: slug, ar: slug }, summaries: { en: 'Test concept', ar: 'مفهوم تجريبي' }, items };
}

describe('server mastery aggregation', () => {
  it('weights lesson progress, mapped quiz accuracy, and lab credit, redistributing weights when evidence is unavailable', () => {
    const full = calculateMastery({ edges: [], concepts: [concept('http', [
      { ...lesson, completed: true }, { ...quiz, attempted: true, correctCount: 1 }, { ...real, provenance: 'SYSTEM_VERIFIED' },
    ])] }, true);
    expect(full.concepts[0]).toMatchObject({ score: 80, status: 'needsRemediation' });
    expect(full.tracks.find(({ track }) => track === 'observability')).toEqual({ track: 'observability', score: 80, assessed: 1, mastered: 0 });
    const onlyLessons = [{ credit: 1, possible: 2, weight: 25 }, { credit: 0, possible: 0, weight: 75 }];
    expect(weightedMasteryScore(onlyLessons)).toBe(50);
    expect(weightedMasteryScore([])).toBeNull();
  });

  it('preserves lab provenance and credits verified, approved, self-reported and unapproved work differently', () => {
    const snapshot = calculateMastery({ edges: [], concepts: [
      concept('reviewed', [{ ...guided, provenance: 'INSTRUCTOR_REVIEWED', review: 'APPROVED' }]),
      concept('reported', [{ ...guided, provenance: 'SELF_REPORTED' }]),
      concept('unapproved', [{ ...guided, provenance: 'INSTRUCTOR_REVIEWED', review: 'NOT_APPROVED' }]),
      concept('system', [{ ...real, provenance: 'SYSTEM_VERIFIED' }]),
      concept('disabled', [real]),
    ] }, false);
    expect(snapshot.concepts.map(({ score, status }) => [score, status])).toEqual([
      [85, 'mastered'], [50, 'inProgress'], [0, 'needsRemediation'], [100, 'mastered'], [null, 'notStarted'],
    ]);
    expect(snapshot.weakest.map(({ slug }) => slug)).toEqual(['unapproved']);
  });

  it('uses score, missed questions, incomplete labs, and a stable key to rank actionable concepts', () => {
    const snapshot = calculateMastery({ edges: [], concepts: [
      concept('just-a-lesson', [{ ...lesson, completed: false }]),
      concept('z-lab', [guided]), concept('a-lab', [guided]),
      concept('failed', [{ ...quiz, attempted: true }, guided]),
      concept('partial', [{ ...quiz, attempted: true, correctCount: 1 }]),
      concept('unmapped', []),
    ] }, true);
    expect(snapshot.weakest.map(({ slug, action }) => [slug, action.kind])).toEqual([
      ['failed', 'quiz'], ['a-lab', 'guided'], ['z-lab', 'guided'], ['just-a-lesson', 'lesson'], ['partial', 'quiz'],
    ]);
  });
});

describe('ontology edges', () => {
  it('admits only supported relationships between distinct known concepts', () => {
    const slugs = new Set(['git', 'gitlab-ci']);
    const edge = { source: 'git', target: 'gitlab-ci', relation: 'prerequisite' };
    expect(validEdge(edge, slugs)).toBe(true);
    expect(validEdge({ ...edge, relation: 'invented' }, slugs)).toBe(false);
    expect(validEdge({ ...edge, target: 'git' }, slugs)).toBe(false);
    expect(validEdge({ ...edge, source: 'missing' }, slugs)).toBe(false);
  });

  it('positions prerequisite chains in order while keeping reciprocal integration edges bounded', () => {
    const { positions, width } = graphLayout(['git', 'gitlab-ci', 'registry'], [
      { source: 'git', target: 'gitlab-ci', relation: 'prerequisite' },
      { source: 'gitlab-ci', target: 'registry', relation: 'prerequisite' },
      { source: 'registry', target: 'git', relation: 'integrates_with' },
    ]);
    const columns = ['git', 'gitlab-ci', 'registry'].map((slug) => positions.get(slug)?.x ?? -1);
    expect(columns[0]).toBeGreaterThanOrEqual(0);
    expect(columns[0]).toBeLessThan(columns[1]);
    expect(columns[1]).toBeLessThan(columns[2]);
    expect(columns[2]).toBeLessThan(width);
  });
});
