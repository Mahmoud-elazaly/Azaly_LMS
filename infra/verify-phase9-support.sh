#!/usr/bin/env bash

phase9_legacy_digest() {
  phase8_legacy_digest
  phase7_sql <<'SQL'
SELECT md5(jsonb_build_array(
  (SELECT to_jsonb(d) FROM authoring.drafts d WHERE course_id='aaa80000-0000-4000-8000-000000000001'),
  (SELECT to_jsonb(e) FROM learning.enrollments e WHERE id='aaa80000-0000-4000-8000-000000000006')
)::text);
SQL
}

phase9_upgrade() {
  test "$(phase7_sql -c 'SELECT count(*) FROM drizzle.__drizzle_migrations')" = 10
  phase7_sql -c "UPDATE authoring.drafts SET last_import_digest=repeat('9',64) WHERE course_id='aaa80000-0000-4000-8000-000000000001'"
  local before
  before="$(phase9_legacy_digest)"
  dc run --rm migrate
  dc run --rm migrate
  test "$(phase7_sql -c 'SELECT count(*) FROM drizzle.__drizzle_migrations')" = 11
  test "$before" = "$(phase9_legacy_digest)"
  echo 'Phase 9 upgraded and replayed the v0.7.0 fixtures and preserved identity, imported drafts, enrollment pins, grades, and both lab models.'
}
