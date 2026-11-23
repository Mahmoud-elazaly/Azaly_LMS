# IT Engineering Academy

Self-hosted technical LMS foundation with an Arabic and English public portal. The catalog reads published PostgreSQL revisions. A clean database starts with an empty catalog. The original Prometheus and Grafana HTML is offline reference material.

## Requirements

Use Docker Engine and Docker Compose from the WSL terminal. The Dockerfile supplies Node.js 24 and uses Corepack to install the pnpm version pinned in `package.json`. The WSL host needs no JavaScript toolchain.

Create a local `.env` from `.env.example` if it does not exist. Set both password fields to different URL-safe values generated with `openssl rand -hex 32`. Reuse the existing environment and credentials for an existing database volume.

## Lockfile bootstrap

The WSL host verified the Phase 1 lockfile. To refresh it for Phase 2, use the lockfile update procedure below. To bootstrap a missing lockfile, run this from the repository root on a Docker host with registry access. The container sees only the package manifests, and the generated lockfile is written under the invoking user's UID.

```sh
(
  set -eu
  test ! -e pnpm-lock.yaml
  scratch="$(mktemp -d)"
  trap 'rm -r -- "$scratch"' EXIT
  cp package.json pnpm-workspace.yaml "$scratch/"
  docker run --rm --user "$(id -u):$(id -g)" \
    -e HOME=/tmp -e COREPACK_HOME=/tmp/corepack \
    -v "$scratch:/workspace" -w /workspace node:24-bookworm-slim \
    corepack pnpm install --lockfile-only
  cp "$scratch/pnpm-lock.yaml" .
)
```

Review and add `pnpm-lock.yaml` to Git. The image build performs `pnpm install --frozen-lockfile` before copying application source.

## Docker development

Run the commands below from the repository root. The development project uses its own database volume. PostgreSQL stays on the private Compose network.

```sh
dc() { docker compose -p academy-dev -f compose.yaml -f infra/compose.dev.yaml "$@"; }
dc build dev
dc up -d --wait postgres
dc run --rm --build migrate
dc up -d dev
```

Open [Arabic](http://127.0.0.1:3000/ar) or [English](http://127.0.0.1:3000/en). If you configured a different `BETTER_AUTH_URL`, open that origin so sign-in requests pass the origin check. Changes in `app`, `src`, and `tests` are available to the container through bind mounts. Next.js reloads application source changes. Rebuild the development image after changing package manifests, the lockfile, or root configuration with `dc up -d --build dev`. Rebuild the migration image when migrations change. Stop development with `dc stop` and restart with `dc up -d postgres dev`.

## Quality checks

Using the `dc` function above, run the dependency install, lint, TypeScript checks, unit tests, and the production build:

```sh
dc build dev
dc run --rm --no-deps dev pnpm lint
dc run --rm --no-deps dev pnpm typecheck
dc run --rm --no-deps dev pnpm test
dc run --rm --no-deps dev pnpm build
```

Run Playwright against a fresh, dedicated test database. Use an unused project name if `academy-test` already contains data. The browser image installs Chromium and its OS dependencies during its build. Its test server listens inside the container.

```sh
tc() { docker compose -p academy-test -f compose.yaml -f infra/compose.dev.yaml "$@"; }
tc up -d --wait postgres
tc run --rm --build migrate
tc run --rm migrate
tc --profile test run --rm --build browser sh -eu -c 'pnpm build && pnpm test:e2e'
tc stop
```

The smoke suite expects an empty catalog and removes its own fixtures. The test container receives database owner access to manage those fixtures. The development and production web containers use the catalog reader. Phase 1 verification status is tracked in [PLANS.md](PLANS.md).

## Self-hosted deployment

Complete the lockfile bootstrap and set up `.env` before building. Use the base Compose file. Stop the development web container first if it is using port 3000.

```sh
docker compose config --quiet
docker compose up --build -d --wait
docker compose ps -a
curl --fail http://127.0.0.1:3000/api/health
curl --fail http://127.0.0.1:3000/api/ready
```

`/api/health` reports process liveness. `/api/ready` checks that the database responds and the catalog tables are readable. Use `docker compose stop` to stop the stack and `docker compose up -d --wait` to restart it with its existing storage.

## Phase 1 acceptance on WSL

Run the acceptance script from the repository root:

```sh
bash infra/verify-phase1.sh
```

The script creates a uniquely named Compose project with a fresh database volume and generated credentials. It publishes no host ports, so the running application can stay online. It reruns the quality checks and Playwright, verifies migration history and catalog reader privileges, checks readiness during a database outage, and verifies data persistence and readiness recovery after recreating PostgreSQL. It stops the verification containers at exit and retains the test volume. The isolated WSL run passed all five Playwright tests and the database outage, recovery, and persistence checks. See PLANS.md for the recorded evidence.

## Phase 2 identity migration verification

Run this in WSL against a new Compose project. It applies both migrations twice, runs the rollback-only database permission test, and retains the isolated volume.

```bash
(
  set -euo pipefail
  project="academy-identity-$(openssl rand -hex 6)"
  export POSTGRES_PASSWORD="$(openssl rand -hex 32)"
  export POSTGRES_READER_PASSWORD="$(openssl rand -hex 32)"
  dc() { docker compose -p "$project" "$@"; }
  trap 'dc stop' EXIT
  dc up -d --wait postgres
  dc run --rm --build migrate
  dc run --rm migrate
  dc exec -T postgres psql -X -v ON_ERROR_STOP=1 -U academy -d academy \
    < tests/integration/identity-permissions.sql
)
```

The migration runner must be able to create a PostgreSQL role. The Compose database owner has this privilege. The migration creates the authentication runtime group. Provision the authentication login and first Owner using the setup below.

## Reverse proxy and operations

Run the web service behind a trusted TLS reverse proxy on the same host. Preserve the original host and set `X-Forwarded-Proto` from the incoming request protocol. The database stays on an internal network. Initialization scripts run only for a fresh volume. Back up existing databases before changing roles, credentials or schema, and apply new migrations before routing traffic to updated web containers.

## Scope

The app supports anonymous catalog browsing, student registration and sign-in, role-based course authoring, version-pinned enrollment, lesson progress, bookmarks and graded course quizzes. Guided Labs and isolated lab execution are scheduled separately in ROADMAP.md.

## Phase 2 on WSL

Better Auth 1.7.27 requires Drizzle ORM 0.45.2 or later on the stable 0.45 line. The repository includes a verified lockfile. When intentionally updating dependencies, refresh it from a copy of the existing graph:

```bash
(
  set -euo pipefail
  scratch=$(mktemp -d)
  trap 'rm -rf -- "$scratch"' EXIT
  cp package.json pnpm-workspace.yaml pnpm-lock.yaml "$scratch/"
  docker run --rm --user "$(id -u):$(id -g)" \
    -e HOME=/tmp -e COREPACK_HOME=/tmp/corepack \
    -v "$scratch:/workspace" -w /workspace node:24-bookworm-slim \
    corepack pnpm install --lockfile-only --no-frozen-lockfile
  cp "$scratch/pnpm-lock.yaml" pnpm-lock.yaml
)
```

### Configure authentication and initialize the Owner

Set `BETTER_AUTH_URL` to the public HTTPS origin (or `http://127.0.0.1:3000` for local testing). Set `BETTER_AUTH_SECRET` to a persistent random value generated with `openssl rand -hex 32`. Keep these values in the ignored `.env`. For HTTPS, configure the trusted reverse proxy to replace `X-Academy-Client-IP` with the actual client IP and prevent direct public access to the app port. Requests without that header share a loopback rate-limit bucket. This slice uses in-memory limits for a single web process. Email verification and password recovery are unavailable until mail delivery is configured.

After applying migrations, provision the least-privilege login and bootstrap the Owner through the migration image. The example uses `academy-dev`. Select the intended project before running the commands.

```bash
dc() { docker compose -p academy-dev -f compose.yaml -f infra/compose.dev.yaml "$@"; }
dc run --rm --build migrate
read -rs -p 'Authentication database password (64 lowercase hex characters): ' auth_db_password
printf '\n'
printf '{"password":"%s"}\n' "$auth_db_password" | dc run --rm -T migrate pnpm auth:provision-login
unset auth_db_password
dc run --rm -T migrate pnpm auth:bootstrap-owner < /path/to/private-owner.json
```

Use a newly generated `openssl rand -hex 32` value for the database login. Set `AUTH_DATABASE_URL` in `.env` to `postgresql://academy_auth:YOUR_AUTH_DB_PASSWORD@postgres:5432/academy` using the same password. Provisioning preserves an existing login password. The private JSON file must be outside the repository, have mode `0600`, and contain `name`, `email`, and a unique 12–128 character `password`. Keep the password in your credential manager. The CLI reads it from stdin and hashes it with Better Auth. A subsequent run preserves the existing Owner. The database blocks demoting, banning, or deleting an active Owner in this slice. Restart the relevant web container after setting the authentication environment.

Only the email registration, email sign-in, sign-out, and sanitized session endpoints are exposed under `/api/auth`. Registration uses the Student role and does not sign in automatically. Admin plugin endpoints stay closed until the application has guarded administrative mutations. The localized account pages use these endpoints and a locale-specific return-path allowlist. The administrative page and its API use the audited database operation to change other users’ roles, suspend accounts, or restore them. An Owner can manage Admins, Instructors, and Students. Admins can manage Instructors and Students. Role and status changes require the affected user to sign in again.

### Verify Phase 2 in isolation

```bash
bash infra/verify-phase2.sh
```

The verification stack publishes no ports and stops on exit. It retains its isolated database volume. The runner exercises the standalone production container, restarts it to validate session persistence, and runs the isolated Playwright suite against the migrated database.

## Phase 3 course builder on WSL

Run `bash infra/verify-phase3.sh` from the repository root to verify in a fresh isolated project. The script publishes no host ports, stops its services on exit, and retains the isolated database volume. Its failure output includes the web, browser and PostgreSQL container logs where available.

For an existing deployment, apply the additive migrations using the usual migration service. Generate a distinct authoring password with `openssl rand -hex 32`, then provision the login using the same Compose project as the deployment:

```bash
read -rs -p 'Authoring database password (64 lowercase hex characters): ' author_db_password
printf '\n'
printf '{"password":"%s"}\n' "$author_db_password" |
  docker compose run --rm -T migrate node scripts/identity-admin.mjs provision-authoring
unset author_db_password
```

Set `AUTHORING_DATABASE_URL` in the ignored `.env` to `postgresql://academy_author:YOUR_AUTHORING_DB_PASSWORD@postgres:5432/academy` using the same password and recreate the web service to load the setting. Use the role-aware navigation to open `/en/builder` or `/ar/builder`. Complete one language to publish, or complete both to publish in both catalogs. Any started course translation must have its own complete module, lesson and block text. Archive hides the course while preserving its revisions and slug.

## Phase 4 learner experience on WSL

Run `bash infra/verify-phase4.sh` to verify the learner experience and prior regression suites in a separate Compose project. The runner publishes no host ports, prints container logs on failure, and retains the isolated volume.

For an existing deployment, apply the additive migration with the migration service, generate a distinct learner password with `openssl rand -hex 32`, and provision the login in the deployment's Compose project:

```bash
read -rs -p 'Learner database password (64 lowercase hex characters): ' learner_db_password
printf '\n'
printf '{"password":"%s"}\n' "$learner_db_password" |
  docker compose run --rm -T migrate node scripts/identity-admin.mjs provision-learner
unset learner_db_password
```

Set `LEARNER_DATABASE_URL` in the ignored `.env` to `postgresql://academy_learner:YOUR_LEARNER_DB_PASSWORD@postgres:5432/academy` and recreate the web service to load it. Students enroll from published course details and resume from My learning. Enrollments stay pinned to the revision selected at enrollment. Withdrawal prevents new enrollments while existing learners can continue on their original published revision. Catalog entries created before structured snapshots must be republished with structured content before they can accept enrollments.

Use the existing course builder to add optional multiple-choice quizzes. Author each published locale independently and keep the choices in equivalent order across languages because the correct index is shared. Learners see their own grades. Correct answers are kept in the private publication snapshot.
