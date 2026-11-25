import { sql } from 'drizzle-orm';
import { check, index, pgSchema, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const knowledge = pgSchema('knowledge');
export const knowledgeTrack = knowledge.enum('track', [
  'linux-os', 'web-proxy', 'git-ci', 'containers', 'observability', 'security',
]);
export const conceptRelation = knowledge.enum('relation_type', [
  'prerequisite', 'integrates_with', 'monitors', 'secures', 'deploys_to',
]);
const conceptId = () => uuid('concept_id').notNull().references(() => concepts.id);
const courseSlug = () => text('course_slug');

export const concepts = knowledge.table('concepts', {
  id: uuid().defaultRandom().primaryKey(),
  slug: text().notNull().unique(),
  trackSlug: knowledgeTrack('track_slug').notNull(),
  titleEn: text('title_en').notNull(),
  titleAr: text('title_ar').notNull(),
  summaryEn: text('summary_en').notNull(),
  summaryAr: text('summary_ar').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('concept_slug_format', sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(${table.slug}) <= 64`),
  check('concept_bilingual_copy', sql`length(btrim(${table.titleEn})) BETWEEN 1 AND 120
    AND length(btrim(${table.titleAr})) BETWEEN 1 AND 120 AND length(btrim(${table.summaryEn})) BETWEEN 1 AND 1200
    AND length(btrim(${table.summaryAr})) BETWEEN 1 AND 1200`),
]);

export const conceptEdges = knowledge.table('concept_edges', {
  id: uuid().defaultRandom().primaryKey(),
  sourceConceptId: uuid('source_concept_id').notNull().references(() => concepts.id),
  targetConceptId: uuid('target_concept_id').notNull().references(() => concepts.id),
  relationType: conceptRelation('relation_type').notNull(),
}, (table) => [
  unique('concept_edge_unique').on(table.sourceConceptId, table.targetConceptId, table.relationType),
  index('concept_edges_target_idx').on(table.targetConceptId),
  check('concept_edge_distinct_ends', sql`${table.sourceConceptId} <> ${table.targetConceptId}`),
]);

// Stable IDs live inside immutable course snapshots, rather than separate lesson or question tables.
export const lessonConcepts = knowledge.table('lesson_concepts', {
  courseSlug: courseSlug().notNull(),
  lessonId: uuid('lesson_id').notNull(),
  conceptId: conceptId(),
}, (table) => [primaryKey({ columns: [table.courseSlug, table.lessonId, table.conceptId] })]);

export const questionConcepts = knowledge.table('question_concepts', {
  courseSlug: courseSlug().notNull(),
  questionId: uuid('question_id').notNull(),
  conceptId: conceptId(),
}, (table) => [primaryKey({ columns: [table.courseSlug, table.questionId, table.conceptId] })]);

export const labConcepts = knowledge.table('lab_concepts', {
  courseSlug: courseSlug(),
  labId: uuid('lab_id'),
  realTemplateVersion: text('real_template_version'),
  conceptId: conceptId(),
}, (table) => [
  unique('lab_concepts_guided_unique').on(table.courseSlug, table.labId, table.conceptId),
  unique('lab_concepts_real_unique').on(table.realTemplateVersion, table.conceptId),
  check('lab_concepts_kind', sql`(${table.courseSlug} IS NOT NULL AND ${table.labId} IS NOT NULL AND ${table.realTemplateVersion} IS NULL)
    OR (${table.courseSlug} IS NULL AND ${table.labId} IS NULL AND ${table.realTemplateVersion} = 'nginx-reverse-proxy@1'
      AND ${table.realTemplateVersion} IS NOT NULL)`),
]);
