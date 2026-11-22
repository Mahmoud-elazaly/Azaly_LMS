#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

(
  set -euo pipefail
  project="academy-auth-$(openssl rand -hex 6)"
  container="$project-web"
  dc() { docker compose -p "$project" -f compose.yaml -f infra/compose.dev.yaml "$@"; }
  cleanup() {
    local status=$?
    if (( status != 0 )); then
      docker logs --tail 50 "$container" >&2 || true
    fi
    docker rm -f "$container" >/dev/null 2>&1 || true
    dc stop || true
    return "$status"
  }
  trap cleanup EXIT
  export POSTGRES_PASSWORD="$(openssl rand -hex 32)"
  export POSTGRES_READER_PASSWORD="$(openssl rand -hex 32)"
  export BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
  export BETTER_AUTH_URL=http://127.0.0.1:3000
  auth_db_password="$(openssl rand -hex 32)"
  export AUTH_DATABASE_URL="postgresql://academy_auth:$auth_db_password@postgres:5432/academy"
  export AUTH_TEST_OWNER_PASSWORD="$(openssl rand -hex 32)"

  dc build dev web
  dc run --rm --no-deps dev sh -eu -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'
  dc up -d --wait postgres
  dc run --rm --build migrate
  dc run --rm migrate
  dc exec -T postgres psql -X -v ON_ERROR_STOP=1 -U academy -d academy \
    < tests/integration/identity-permissions.sql
  printf '{"password":"%s"}\n' "$auth_db_password" | dc run --rm -T migrate pnpm auth:provision-login
  printf '{"name":"Test Owner","email":"owner@example.test","password":"%s"}\n' "$AUTH_TEST_OWNER_PASSWORD" |
    dc run --rm -T migrate pnpm auth:bootstrap-owner
  dc run --rm -T migrate pnpm auth:bootstrap-owner </dev/null
  dc run --rm --no-deps -T dev node --input-type=module - <<'JS'
import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.AUTH_DATABASE_URL, connectionTimeoutMillis: 2500 });
try {
  await client.connect();
  const { rows: [result] } = await client.query(`
    SELECT current_user AS login,
      pg_has_role(current_user, 'academy_auth_runtime', 'USAGE') AS inherits_auth,
      has_schema_privilege(current_user, 'identity', 'USAGE') AS identity_access,
      has_table_privilege(current_user, 'identity."user"', 'SELECT') AS reads_users,
      has_table_privilege(current_user, 'identity.account', 'INSERT') AS writes_accounts
  `);
  if (result.login !== 'academy_auth' || !result.inherits_auth || !result.identity_access ||
      !result.reads_users || !result.writes_accounts) throw new Error('Invalid runtime grants');
  console.log('Authentication runtime TCP login and identity grants verified.');
} catch (error) {
  const code = error instanceof Error && typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
    ? ` (${error.code})` : '';
  console.error(`Authentication database preflight failed${code}.`);
  process.exitCode = 1;
} finally {
  await client.end();
}
JS
  dc run -d --no-deps --name "$container" web
  wait_for_app() {
    local attempt
    for attempt in $(seq 1 30); do
      if docker exec "$container" node -e 'fetch("http://127.0.0.1:3000/api/health").then(r => { if (!r.ok) process.exitCode = 1 }).catch(() => { process.exitCode = 1 })'; then
        return 0
      fi
      sleep 1
    done
    return 1
  }
  wait_for_app
  docker exec -i -e AUTH_TEST_OWNER_PASSWORD "$container" node --input-type=module - < tests/integration/auth-smoke.mjs
  docker restart "$container"
  wait_for_app
  docker exec -i -e AUTH_TEST_OWNER_PASSWORD "$container" node --input-type=module - after-restart < tests/integration/auth-smoke.mjs
  dc --profile test run --rm --build browser sh -eu -c 'pnpm build && pnpm test:e2e'
)
