export const tracks = ['linux-os', 'web-proxy', 'git-ci', 'containers', 'observability', 'security'] as const;
export type Track = (typeof tracks)[number];
export const relations = ['prerequisite', 'integrates_with', 'monitors', 'secures', 'deploys_to'] as const;
export type Relation = (typeof relations)[number];
export type Edge = { source: string; target: string; relation: Relation };
export type LocalizedText = { en: string; ar: string };

export function validEdge(edge: { source: string; target: string; relation: string }, slugs: ReadonlySet<string>): edge is Edge {
  return edge.source !== edge.target && slugs.has(edge.source) && slugs.has(edge.target) &&
    relations.some((relation) => relation === edge.relation);
}

export type CourseMaterial = { id: string; title: string; courseSlug: string; courseTitle: string; enrollmentId: string | null };
export type Material =
  | (CourseMaterial & { kind: 'lesson'; completed: boolean })
  | (CourseMaterial & { kind: 'quiz'; total: number; correctCount: number; attempted: boolean })
  | (CourseMaterial & { kind: 'guided'; provenance: 'SELF_REPORTED' | 'INSTRUCTOR_REVIEWED' | null;
      review: 'APPROVED' | 'NOT_APPROVED' | null })
  | { kind: 'real'; id: string; provenance: 'SYSTEM_VERIFIED' | null };

export type ConceptEvidence = { slug: string; track: Track; titles: LocalizedText; summaries: LocalizedText; items: Material[] };
export type Evidence = { concepts: ConceptEvidence[]; edges: Edge[] };
export type MasteryStatus = 'notStarted' | 'inProgress' | 'mastered' | 'needsRemediation';
export type Signal = { credit: number; possible: number };
export type MasteryBreakdown = {
  lessons: Signal;
  quizzes: Signal & { attempted: number };
  labs: Signal & { incomplete: number };
};
export type MasteryConcept = ConceptEvidence & { score: number | null; status: MasteryStatus; breakdown: MasteryBreakdown };
export type TrackProgress = { track: Track; score: number | null; mastered: number; assessed: number };
export type Remediation = { slug: string; score: number; track: Track; titles: LocalizedText; action: Material };
export type MasterySnapshot = { concepts: MasteryConcept[]; edges: Edge[]; tracks: TrackProgress[]; weakest: Remediation[] };
