#!/usr/bin/env bash

phase10_legacy_digest() {
  phase9_legacy_digest
  phase7_sql <<'SQL'
SELECT md5(jsonb_build_array(
  (SELECT jsonb_agg(to_jsonb(c) ORDER BY slug) FROM knowledge.concepts c),
  (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM knowledge.concept_edges e),
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY lesson_id, concept_id) FROM knowledge.lesson_concepts m),
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY question_id, concept_id) FROM knowledge.question_concepts m),
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY course_slug, lab_id, real_template_version, concept_id) FROM knowledge.lab_concepts m)
)::text);
SQL
}

phase10_upgrade() {
  test "$(phase7_sql -c 'SELECT count(*) FROM drizzle.__drizzle_migrations')" = 11
  local before
  before="$(phase10_legacy_digest)"
  dc run --rm migrate
  dc run --rm migrate
  test "$(phase7_sql -c 'SELECT count(*) FROM drizzle.__drizzle_migrations')" = 12
  test "$before" = "$(phase10_legacy_digest)"
  echo 'Phase 10 upgraded and replayed the v0.8.0 fixtures without changing existing learning records or the knowledge ontology.'
}
