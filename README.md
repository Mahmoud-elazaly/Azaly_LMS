# Azaly LMS

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

The footer shows the application version from `package.json` in both locales. A published release has a matching `v<version>` Git tag. Follow the build and release steps in [AGENTS.md](AGENTS.md#builds-and-releases).

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

The app supports anonymous catalog browsing, administrator-managed invitations and sign-in, role-based course authoring, version-pinned enrollment, lesson progress, bookmarks and graded course quizzes. Guided Labs and isolated lab execution are scheduled separately in ROADMAP.md.

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

Set `BETTER_AUTH_URL` to the public HTTPS origin (or the exact loopback origin used in the browser for local testing). Set `BETTER_AUTH_SECRET` to a persistent random value generated with `openssl rand -hex 32`. Keep these values in the ignored `.env`. For HTTPS, configure the trusted reverse proxy to replace `X-Academy-Client-IP` with the actual client IP and prevent direct public access to the app port. Requests without that header share a loopback rate-limit bucket. Better Auth applies sign-in limits per web process. Invitation activation and management limits are stored in PostgreSQL.

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

### Provision accounts by invitation

Starting in version 0.3.0, public registration is closed. The localized user directory is at `/en/admin/users` and `/ar/admin/users`. Owners can provision and manage Admins, Instructors, and Learners. Admins can manage Instructors and Learners. Role and status changes revoke the affected user's sessions. Existing accounts remain available after upgrading.

Set `INVITATION_MAIL_API_KEY` and `INVITATION_MAIL_FROM` in `.env` and restart the web service. Use a verified sender and allow the service outbound access to `https://api.resend.com/emails`. A compatible HTTPS relay can be configured with `INVITATION_MAIL_URL`. It must accept a bearer-authenticated JSON request with `from`, `to`, `subject`, and `text`, and return a successful HTTP response with a nonempty `id` when it accepts a message.

An invitation expires after 48 hours and can be used once. Resending replaces the previous link. Revoking closes the invitation immediately. If mail is unconfigured, invite and resend requests report the missing configuration. If the provider rejects a message, the invitation remains pending and the administrator can resend it. Accepted means the provider accepted the message for delivery. The sign-in help dialog directs users to their administrator.

For production, back up PostgreSQL, apply `0006_closed_registration` through the existing migration service, configure the sender and HTTPS origin, then deploy the web image. Send a test invitation to a mailbox you control and confirm that the link opens the expected public origin before inviting users.

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

## Publish the Prometheus and Grafana course

Version 0.5.0 includes the curated Arabic and English course. The deployment operator imports it through the migration service after migrations and Owner bootstrap. Select the intended Compose project first. For the development project established above, run:

```sh
dc run --rm --build migrate
dc run --rm migrate pnpm db:seed:prometheus-grafana draft
```

Review the private draft in the Course builder. It belongs to the only active Owner by default. Pass `--author <email>` to both commands to assign it to a specific active Owner, Admin, or Instructor. An Instructor can review attempts for the course they own.

Publish the reviewed draft in the builder or publish the exact curated revision with:

```sh
dc run --rm migrate pnpm db:seed:prometheus-grafana publish
```

Both commands can be rerun. The publisher requires an unchanged curated draft. If an author has edited the draft, review and publish that revision in the builder. An existing course with the same slug is preserved, and the import stops with a conflict. Once the curated revision has been recorded, seeding leaves later edits and publication decisions to staff.

The published course appears at `/ar/courses/prometheus-grafana` and `/en/courses/prometheus-grafana`. Signed-in Students enroll from those pages. The practice files in the lessons use separate loopback ports on a learner-controlled environment, and the course keeps lab credentials local to that environment.

Run `bash infra/verify.sh` for the full platform gate. The Phase 6 checks run the course journey in Chromium, confirm scoped PostgreSQL access, and start a separate practice Compose project to validate the published configuration and queries. The gate uses Docker, Bash, OpenSSL, Python 3, and curl on the host. See [acceptance criteria](ACCEPTANCE_TESTS.md).

## Enable the NGINX Real Lab pilot

Version 0.6.0 adds an opt-in pilot for learners with administrator-provisioned accounts. Apply migrations first. Provision `academy_real_lab_bridge` with the migration service and configure a private worker. The PostgreSQL login and controller secret belong to the bridge. Web services receive only `REAL_LAB_BRIDGE_URL`.

For local development and acceptance, add the lab overlay and enable its local worker profile. This example assumes the Compose environment is already configured. Save the bridge password and controller secret in a protected operator environment if you need to recreate the services. Use the existing database login password on later runs. Set `LAB_CONTROL_SUBNET` to an unused private IPv4 subnet if the default `10.246.70.0/28` overlaps another network.

```bash
dc() { docker compose -p academy-dev -f compose.yaml -f infra/compose.dev.yaml -f infra/compose.lab.yaml --profile lab-local "$@"; }
dc run --rm --build migrate
bridge_password="$(openssl rand -hex 32)"
printf '{"password":"%s"}\n' "$bridge_password" |
  dc run --rm -T migrate node scripts/identity-admin.mjs provision-real-lab
export REAL_LAB_DATABASE_URL="postgresql://academy_real_lab_bridge:$bridge_password@postgres:5432/academy"
unset bridge_password
export LAB_CONTROLLER_SECRET="$(openssl rand -hex 32)"
export LAB_CONTROLLER_URL=http://lab-controller:8401
export REAL_LAB_BRIDGE_URL=http://lab-bridge:8400
docker build --target lab-sandbox -t academy-dev-lab-sandbox .
export LAB_SANDBOX_IMAGE="$(docker image inspect academy-dev-lab-sandbox --format '{{.Id}}')"
dc up -d --build --wait lab-controller lab-bridge dev
```

Open the NGINX lab through My learning or visit `/ar/real-lab` or `/en/real-lab` and sign in as a Student. Stop a lab when finished. Reset discards the workspace, and the next start creates a new instance. New starts can be denied while cleanup is in progress.

For a deployment, build the `lab-sandbox` and `lab-controller` image targets on the dedicated Docker worker. Configure the controller with `LAB_SANDBOX_IMAGE` set to the approved local image ID, a deployment-specific `LAB_NAMESPACE`, and the shared `LAB_CONTROLLER_SECRET`. Mount the Docker socket only into the controller. Forward controller port 8401 through a private HTTPS ingress, restrict ingress to the bridge, and set the bridge's `LAB_CONTROLLER_URL` to that HTTPS origin. Run the bridge from `infra/compose.lab.yaml` without the `lab-local` profile. Enable the web workspace with `REAL_LAB_BRIDGE_URL=http://lab-bridge:8400`. Configure log collection for cleanup failure messages and investigate if repeated cleanup attempts fail.

Run `bash infra/verify.sh` for the cumulative local and CI gate. See [Phase 7 acceptance](ACCEPTANCE_TESTS.md#phase-7-isolated-nginx-pilot).

## Import a Markdown course

Use `pnpm course:import --dry-run SOURCE` to validate a package and print its content counts and warnings as JSON. A dry run works without an authoring database connection. A standalone Markdown file starts with a level-one heading and uses `--slug` and `--locale ar|en` to set its course identity and language.

```bash
pnpm course:import --dry-run lesson.md --slug nginx-routing --locale en
pnpm course:import --dry-run course.zip
```

A ZIP has a root `course.json`. Use stable keys for modules, lessons, and quiz questions so repeated imports preserve their IDs. Each lesson maps its translations to separate UTF-8 Markdown files.

```json
{
  "slug": "nginx-routing",
  "translations": {
    "en": { "title": "NGINX routing", "summary": "Follow the request to its upstream." }
  },
  "modules": [{
    "key": "routing",
    "titles": { "en": "Routing" },
    "lessons": [{
      "key": "upstream",
      "titles": { "en": "Upstreams" },
      "markdown": { "en": "lessons/upstream.en.md" }
    }]
  }]
}
```

Use an `ar` counterpart at each level for a bilingual course. A lesson's `mermaid` code fences render as diagrams with pan, zoom, and source fallback. The archive can also declare a `quizzes` array of keys such as `["review"]`. Each key maps to `quizzes/<key>.quiz.json` with localized `titles` and an ordered `questions` array, and `quizzes/<key>.answers.json` with an answer object per question key. Use these fields for each question kind.

| Kind | Question fields in addition to `key` and `translations` | Matching answer object |
| --- | --- | --- |
| Multiple choice | Localized `choices` in each translation and optional `type: "mcq"` | `{"correct": 0}` |
| Find the bug | `type: "find_bug"`, `language` (`config`, `yaml`, `dockerfile`, `promql`, or `nginx`), and `snippet` | `{"faultyLines": [2, 4]}` |
| CLI recall | `type: "cli_recall"` | `{"rule": {"mode": "exact", "value": "kubectl get pods"}}` |

Question translations each contain a `prompt` and can include a private `explanation`. CLI rules accept `exact`, `flags`, or `regex`. Exact and flags modes normalize whitespace outside quotes. Flags mode allows independent flags in any order, preserves positional argument order and honors the `--` delimiter. Use `--flag=value` for flags with values. Regex mode matches the normalized command as a whole using a bounded pattern without lookaround or backreferences.

The importer reports ignore-filter matches, binary artifacts, unmapped files, and missing or unmatched quiz pairs as warnings. An unmatched pair is skipped. Resolve any structural errors reported by dry run before applying.

To apply, configure `AUTHORING_DATABASE_URL` for the existing authoring login and pass the raw token of a live staff session in a private `COURSE_IMPORT_SESSION_TOKEN` environment variable. For the Docker development setup, pass the variable by name and mount the input read-only.

```bash
docker compose -p academy-dev -f compose.yaml -f infra/compose.dev.yaml run --rm --no-deps \
  -e COURSE_IMPORT_SESSION_TOKEN -v "$PWD/course.zip:/inputs/course.zip:ro" \
  dev pnpm course:import --apply /inputs/course.zip
```

Review the resulting draft in the existing course builder and publish from there. Reapplying the same source to an unchanged imported draft returns `unchanged`. Changed sources update only that draft. A `draft_conflict` means the target draft has staff edits or belongs to a different authoring workflow.
