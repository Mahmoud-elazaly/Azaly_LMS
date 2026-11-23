#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

(
  set -euo pipefail
  prefix=academy-learning
  if [[ "${PHASE5_TEST:-}" == 1 ]]; then prefix=academy-phase5; fi
  if [[ "${PHASE6_TEST:-}" == 1 ]]; then prefix=academy-phase6; fi
  project="$prefix-$(openssl rand -hex 6)"
  container="$project-web"
  dc() { docker compose -p "$project" -f compose.yaml -f infra/compose.dev.yaml "$@"; }
  cleanup() {
    local status=$?
    if (( status != 0 )); then
      docker logs --tail 50 "$container" >&2 || true
      dc logs --tail 50 postgres >&2 || true
      docker logs --tail 50 "$project-browser" >&2 || true
    fi
    docker rm -f "$container" >/dev/null 2>&1 || true
    docker rm -f "$project-browser" >/dev/null 2>&1 || true
    if [[ "${PHASE5_TEST:-}" == 1 ]]; then dc down || true; else dc stop || true; fi
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
  author_db_password="$(openssl rand -hex 32)"
  export AUTHORING_DATABASE_URL="postgresql://academy_author:$author_db_password@postgres:5432/academy"
  export PHASE3_TEST=1
  export PHASE4_TEST=1
  learner_db_password="$(openssl rand -hex 32)"
  export LEARNER_DATABASE_URL="postgresql://academy_learner:$learner_db_password@postgres:5432/academy"

  dc build dev web
  dc run --rm --no-deps dev sh -eu -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'
  dc up -d --wait postgres
  dc run --rm --build migrate
  dc run --rm migrate
  dc exec -T postgres psql -X -v ON_ERROR_STOP=1 -U academy -d academy \
    < tests/integration/identity-permissions.sql
  dc exec -T postgres psql -X -v ON_ERROR_STOP=1 -U academy -d academy \
    < tests/integration/authoring-permissions.sql
  dc exec -T postgres psql -X -v ON_ERROR_STOP=1 -U academy -d academy \
    < tests/integration/learning-permissions.sql
  printf '{"password":"%s"}\n' "$learner_db_password" |
    dc run --rm -T migrate node scripts/identity-admin.mjs provision-learner
  printf '{"password":"%s"}\n' "$author_db_password" |
    dc run --rm -T migrate node scripts/identity-admin.mjs provision-authoring
  printf '{"password":"%s"}\n' "$auth_db_password" | dc run --rm -T migrate pnpm auth:provision-login
  printf '{"name":"Test Owner","email":"owner@example.test","password":"%s"}\n' "$AUTH_TEST_OWNER_PASSWORD" |
    dc run --rm -T migrate pnpm auth:bootstrap-owner
  dc run --rm -T migrate pnpm auth:bootstrap-owner </dev/null
  if [[ "${PHASE5_TEST:-}" == 1 ]]; then
    dc exec -T postgres psql -X -v ON_ERROR_STOP=1 -U academy -d academy < tests/integration/phase5-permissions.sql
  fi
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
  dc --profile test run --name "$project-browser" --build browser sh -eu -c '
    pnpm build
    pnpm exec playwright test tests/e2e/identity.spec.ts tests/e2e/public.spec.ts
    pnpm exec playwright test tests/e2e/course-builder.spec.ts
    pnpm exec playwright test tests/e2e/learning.spec.ts
    if [ "${PHASE5_TEST:-}" = 1 ]; then pnpm exec playwright test tests/e2e/phase5.spec.ts; fi
    if [ "${PHASE6_TEST:-}" = 1 ]; then pnpm exec playwright test tests/e2e/phase6.spec.ts; fi
  '
  docker rm "$project-browser" >/dev/null
  if [[ "${PHASE6_TEST:-}" == 1 ]]; then
    dc exec -T postgres psql -X -v ON_ERROR_STOP=1 -U academy -d academy < tests/integration/phase6-permissions.sql
    dc run --rm --no-deps -T migrate node --input-type=module -e '
      import { labFiles } from "./src/features/curriculum/prometheus-grafana/lab-kit.ts";
      console.log(JSON.stringify(labFiles));
    ' | bash infra/verify-phase6-snippets.sh "$project-practice"
  fi
)
