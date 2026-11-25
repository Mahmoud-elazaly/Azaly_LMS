import { tracks, validEdge, type ConceptEvidence, type Evidence, type MasteryBreakdown, type MasteryConcept,
  type MasterySnapshot, type Material, type Remediation, type Signal } from './model';

export const masteryThreshold = 80;

export function weightedMasteryScore(signals: readonly (Signal & { weight: number })[]) {
  let availableWeight = 0;
  let weightedCredit = 0;
  for (const { credit, possible, weight } of signals) {
    if (possible === 0) continue;
    availableWeight += weight;
    weightedCredit += weight * Math.min(1, Math.max(0, credit / possible));
  }
  return availableWeight === 0 ? null : Math.round(100 * weightedCredit / availableWeight);
}

function labCredit(item: Extract<Material, { kind: 'guided' | 'real' }>) {
  if (item.kind === 'real') return item.provenance === 'SYSTEM_VERIFIED' ? 1 : 0;
  if (item.provenance === 'INSTRUCTOR_REVIEWED') return item.review === 'APPROVED' ? 0.85 : 0;
  return item.provenance === 'SELF_REPORTED' ? 0.5 : 0;
}

function summarize(items: Material[]): MasteryBreakdown {
  const breakdown: MasteryBreakdown = {
    lessons: { credit: 0, possible: 0 },
    quizzes: { credit: 0, possible: 0, attempted: 0 },
    labs: { credit: 0, possible: 0, incomplete: 0 },
  };
  for (const item of items) {
    if (item.kind === 'lesson') {
      breakdown.lessons.possible++;
      breakdown.lessons.credit += Number(item.completed);
    } else if (item.kind === 'quiz') {
      breakdown.quizzes.possible += item.total;
      if (item.attempted) {
        breakdown.quizzes.attempted += item.total;
        breakdown.quizzes.credit += item.correctCount;
      }
    } else {
      const credit = labCredit(item);
      breakdown.labs.possible++;
      breakdown.labs.credit += credit;
      breakdown.labs.incomplete += Number(credit === 0);
    }
  }
  return breakdown;
}

function scoreConcept(concept: ConceptEvidence, labsEnabled: boolean): MasteryConcept {
  const items = concept.items.filter((item) => item.kind !== 'real' || labsEnabled || item.provenance === 'SYSTEM_VERIFIED');
  const breakdown = summarize(items);
  const { quizzes, lessons, labs } = breakdown;
  const score = weightedMasteryScore([{ ...lessons, weight: 25 }, { ...quizzes, weight: 40 }, { ...labs, weight: 35 }]);
  const needsRemediation = quizzes.attempted > quizzes.credit || items.some((item) => item.kind === 'guided' && item.review === 'NOT_APPROVED');
  const started = lessons.credit || quizzes.attempted || labs.credit;
  const status = needsRemediation ? 'needsRemediation' : score !== null && score >= masteryThreshold ? 'mastered'
    : started ? 'inProgress' : 'notStarted';
  return { ...concept, items, breakdown, score, status };
}

function nextPractice(items: Material[], labsEnabled: boolean) {
  return items.find((item) => item.kind === 'quiz' && item.attempted && item.correctCount < item.total)
    ?? items.find((item) => (item.kind === 'guided' && !item.provenance) || (item.kind === 'real' && labsEnabled && !item.provenance))
    ?? items.find((item) => item.kind === 'lesson' && !item.completed)
    ?? items.find((item) => item.kind === 'quiz' && !item.attempted)
    ?? items.find((item) => item.kind === 'guided' && item.review === 'NOT_APPROVED');
}

function missedQuestions(concept: MasteryConcept) {
  return concept.breakdown.quizzes.attempted - concept.breakdown.quizzes.credit;
}

export function calculateMastery(evidence: Evidence, labsEnabled: boolean): MasterySnapshot {
  const concepts = evidence.concepts.map((concept) => scoreConcept(concept, labsEnabled));
  const slugs = new Set(concepts.map((concept) => concept.slug));
  const weakest = concepts.flatMap((concept) => {
    const { slug, track, titles, score, items, breakdown, status } = concept;
    const action = nextPractice(items, labsEnabled);
    if (!action || score === null || (status === 'mastered' && breakdown.labs.incomplete === 0 && !missedQuestions(concept))) return [];
    const entry: Remediation = { slug, track, titles, score, action };
    return [{ entry, misses: missedQuestions(concept), incomplete: breakdown.labs.incomplete }];
  }).sort((a, b) => a.entry.score - b.entry.score || b.misses - a.misses || b.incomplete - a.incomplete
    || a.entry.slug.localeCompare(b.entry.slug, 'en'));

  return {
    concepts,
    edges: evidence.edges.filter((edge) => validEdge(edge, slugs)),
    tracks: tracks.map((track) => {
      const available = concepts.filter((concept) => concept.track === track && concept.score !== null);
      return { track, assessed: available.length, mastered: available.filter(({ status }) => status === 'mastered').length,
        score: available.length === 0 ? null : Math.round(available.reduce((total, concept) => total + (concept.score ?? 0), 0) / available.length) };
    }),
    weakest: weakest.map(({ entry }) => entry),
  };
}
