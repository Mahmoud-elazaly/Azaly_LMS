#!/usr/bin/env bash

phase11_upgrade() {
  test "$(phase7_sql -c 'SELECT count(*) FROM drizzle.__drizzle_migrations')" = 12
  local before
  before="$(phase10_legacy_digest)"
  dc run --rm migrate
  dc run --rm migrate
  test "$(phase7_sql -c 'SELECT count(*) FROM drizzle.__drizzle_migrations')" = 13
  test "$before" = "$(phase10_legacy_digest)"
  echo 'Phase 11 upgraded and replayed v0.9.0 without changing the historical fixture data.'
}
