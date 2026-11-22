#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

# A fresh Compose project isolates the database and avoids existing service names.
project="academy-verify-$(openssl rand -hex 6)"
override=$(mktemp)
trap 'rm -f -- "$override"' EXIT
cat > "$override" <<'YAML'
services:
  web:
    ports: !reset []
YAML

export POSTGRES_PASSWORD="$(openssl rand -hex 32)"
export POSTGRES_READER_PASSWORD="$(openssl rand -hex 32)"
dc() { docker compose -p "$project" -f compose.yaml -f infra/compose.dev.yaml -f "$override" "$@"; }

cleanup() {
  local result=$?
  if ((result != 0)); then
    dc ps -a || true
  fi
  dc stop || true
  rm -f -- "$override"
  printf 'Verification project and retained volume: %s / %s_postgres-data\n' "$project" "$project"
}
trap cleanup EXIT

probe() {
  dc exec -T web node -e '
    const [path, expected] = process.argv.slice(1);
    fetch("http://127.0.0.1:3000" + path, { signal: AbortSignal.timeout(8000) })
      .then(async res => {
        if (res.status !== Number(expected)) throw new Error(path + " returned " + res.status);
        console.log(path, res.status);
      })
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  ' "$1" "$2"
}

dc --profile test config --quiet
dc build dev
dc run --rm --no-deps dev sh -eu -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'
dc up -d --wait postgres
dc run --rm --build migrate
dc run --rm migrate
dc --profile test run --rm --build browser sh -eu -c 'pnpm build && pnpm test:e2e'

dc up -d --build --wait web
probe /ar 200
probe /en 200
probe /api/health 200
probe /api/ready 200
dc exec -T web node -e 'if (process.getuid() === 0) process.exit(1); console.log("Web runs as non-root")'
dc exec -T postgres psql -X -v ON_ERROR_STOP=1 -U academy -d academy <<'SQL'
DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations) THEN
    RAISE EXCEPTION 'Drizzle migration history is empty';
  END IF;
END;
$check$;
INSERT INTO courses (slug) VALUES ('persistence-check');
SET ROLE academy_reader;
DO $check$
DECLARE
  relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['courses', 'course_versions', 'course_translations'] LOOP
    IF NOT has_table_privilege(current_user, relation, 'SELECT')
       OR has_table_privilege(current_user, relation, 'INSERT, UPDATE, DELETE, TRUNCATE') THEN
      RAISE EXCEPTION 'Unexpected catalog reader privileges on %', relation;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM courses WHERE slug = 'persistence-check') THEN
    RAISE EXCEPTION 'Catalog reader cannot read the test row';
  END IF;
END;
$check$;
SQL

dc stop postgres
probe /api/health 200
probe /api/ready 503
dc up -d --force-recreate --wait postgres
dc restart web
dc up -d --wait web
probe /api/ready 200
persisted=$(dc exec -T postgres psql -X -At -v ON_ERROR_STOP=1 -U academy -d academy \
  -c "SELECT count(*) FROM courses WHERE slug = 'persistence-check'")
test "$persisted" = 1
printf 'Database persistence, read-only catalog privileges and readiness recovery verified.\n'
