#!/usr/bin/env bash

phase11_upgrade() {
  test "$(phase7_sql -c 'SELECT count(*) FROM drizzle.__drizzle_migrations')" = 12
  local before
  before="$(phase10_legacy_digest)"
  phase7_migration_slice 13
  phase7_migration_slice 13
  test "$(phase7_sql -c 'SELECT count(*) FROM drizzle.__drizzle_migrations')" = 13
  test "$before" = "$(phase10_legacy_digest)"
  echo 'Phase 11 upgraded and replayed v0.9.0 without changing the historical fixture data.'
  if [[ "${PHASE12_TEST:-}" == 1 ]]; then phase12_upgrade; fi
}
