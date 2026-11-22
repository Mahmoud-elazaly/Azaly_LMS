# Implementation progress

## Phase 0 — Complete

Reviewed the complete Hybrid Architecture blueprint and inventoried the workspace. The architecture and original bilingual Prometheus and Grafana HTML retain their original paths and SHA-256 hashes. The optional master prompt and separate execution roadmap were absent. The empty .git directory provides no usable Git metadata. ARCHITECTURE.md records the blueprint’s route and lab phase terminology decisions. The remaining Phase 0 documents define the data model, trust boundaries, deployment assumptions and gates.

Verified relevant compatibility guidance in the official Next.js, React, Tailwind CSS, Drizzle, Vitest, Playwright and pnpm sources. Chose Node.js 24 for deployment and CI with Node.js 22.13+ also supported by the manifest. Exact direct versions are in package.json.

## Phase 1 — COMPLETED

- Public portal includes Arabic and English home, about, catalog and course details. The localized shell establishes document direction, LTR code blocks, accessible navigation and cookie-backed theme preferences.
- Drizzle models courses, revisions and translations. The initial SQL and migration metadata are versioned in the workspace. Catalog reads exclude drafts, future publications and missing translations.
- Docker Compose defines persistent PostgreSQL, a schema migration job and a non-root web service with read-only catalog credentials. The development override binds PostgreSQL to loopback. Health and readiness have separate endpoints.
- ESLint, TypeScript, Vitest, Playwright and GitHub Actions configurations are present. CI requires a frozen lockfile install.

| Check | Actual result |
| --- | --- |
| git status --short --branch | Failed. The supplied .git directory has no usable metadata. No commit was created. |
| Node and pnpm discovery | Found Node 22.14.0 outside PATH and ran pnpm 11.9.0 through cached Corepack. |
| pnpm install --lockfile-only | Failed. Registry resolution returned EAI_AGAIN. Offline retry failed because the cache lacks @playwright/test metadata. No transitive lockfile was generated. |
| pnpm lint, typecheck, test, build, db:generate, db:migrate, test:e2e | Each was attempted. pnpm failed in dependency bootstrap before executing the underlying command. |
| Native Node assertions | Passed for supported locale direction and invalid-theme fallback. This check used Node type stripping without project dependencies. |
| docker compose config --quiet | Passed for the base configuration and combined development override with temporary placeholder values. |
| docker compose up --build -d --wait | Failed before build. The Docker daemon denied access to its local socket. |
| JSON configuration and migration metadata | Parsed successfully. Drizzle validation still requires dependencies. |
| Original asset hashes | Passed. Both SHA-256 hashes match the pre-edit inventory. |

At the initial implementation checkpoint, application rendering, database migration and connectivity, readiness, smoke tests, CI, and startup were still unverified. The WSL acceptance results below supersede this checkpoint. With a working registry and Docker environment, generate and commit the lockfile, use a fresh dedicated database, verify the initial migration snapshot, and run the Phase 1 acceptance suite before opening Phase 2.

### Phase 1 verification retry

The registry still fails DNS resolution and pnpm still cannot generate the lockfile. Docker daemon access remains denied, and Git metadata is still unavailable. CI now checks for HTTP 503 before applying the catalog migration and applies the migration twice to exercise repeatability. The Compose configuration checks passed again. The workflow YAML parsed and the readiness script passed Bash syntax validation. The new CI checks still require a runtime verification run.

### Phase 1 self-hosted acceptance coverage

CI now starts a disposable Compose project, checks readiness using the web service's catalog reader, tests that the reader can select course metadata and lacks course write privileges, then recreates PostgreSQL with the same named volume and checks that a test row survives. CI tears down only its disposable project and volume.

Validated the updated workflow with Python YAML parsing and `bash -n` on every shell step. Base and development `docker compose config --quiet` passed. A fresh `pnpm install --lockfile-only` attempt failed fetching registry metadata. DNS checks for npm, Yarn and GitHub failed, and `docker info` still returned permission denied. The new Compose runtime checks remain unexecuted. The Phase 1 gate remains open.

### WSL host access and Phase 1 acceptance retry

**Phase 1 remains BLOCKED.** The WSL host may have the necessary access, but this Codex execution sandbox could not use it. The exec tool rejected the request for elevated registry, Docker and Git access because sandbox escalation is disabled by the managed approval policy.

| Check | Actual result |
| --- | --- |
| Git repository and worktree discovery | Git recognized no worktree. The workspace exposed an empty read-only .git directory. No parent Git directory or local history bundle was found during inspection. |
| `git init -b main` | Failed on the read-only .git mount. No project repository or commit was created. |
| Git ignore patterns | Passed using temporary Git metadata outside the project. Local env files, dependencies, generated artifacts and local tool settings are ignored. The example env remains trackable. |
| Node, npm, Corepack, pnpm | Executed Node 22.14.0, npm 10.9.2, Corepack 0.31.0 and pnpm 11.9.0. |
| Registry and lockfile | curl failed DNS resolution. Lockfile-only install failed fetching package metadata. Frozen install reported the missing lockfile. |
| Lint, typecheck, Vitest, production build, Drizzle generation and migration, Playwright | Attempted all commands. Dependency bootstrap failed before the underlying commands ran. |
| Compose and CI static checks | Both Compose configurations passed. Workflow YAML parsed and each shell step passed Bash syntax validation. |
| Docker build and startup | `docker compose up --build -d --wait` stopped at Docker socket permission denial. PostgreSQL, its permissions and persistence, logs and service restart remain unverified. |
| Local HTTP routes | Requests to /ar, /en, /api/health and /api/ready could not connect to port 3000. |
| Local environment and references | Created a mode-0600 local .env with distinct generated passwords. Cleared prefilled values from .env.example. Verified local generated passwords were absent from the checked command logs and tracked configuration. Both reference hashes still match. |

CI's Compose teardown now preserves the named volume. GitHub-hosted CI was unavailable to execute. README records startup and non-destructive stop commands. Phase 2 has not started.

### Docker-first development and verification

Node.js 24 and Corepack live in the build images. Corepack reads the pinned pnpm version from package.json. All dependency installation, lint, type checking, Vitest, the production build, migration commands, and Chromium smoke tests have Docker workflows. Production keeps its frozen install and standalone runtime. The development service bind-mounts source, and the test profile runs Playwright with a dedicated Compose project and database. PostgreSQL has no host port in either configuration. Credentials remain runtime configuration.

Passed `docker compose config --quiet` with the base file and with the development overlay and test profile enabled. Validated CI YAML and Bash syntax and checked the resolved Compose targets, network, mounts, and volume. Per the Docker access restriction, did not call the daemon from the sandbox. The README provides the temporary-container command to generate the lockfile and the host-side verification commands.

**Phase 1 remains BLOCKED.** Lockfile creation and commit, frozen installation, image builds, quality checks, startup, migrations, route and endpoint verification, and persistence testing await execution on the WSL host. Phase 2 has not started.

### Docker dependency build approval

The WSL host generated `pnpm-lock.yaml`. Its first Docker development build failed at `pnpm install --frozen-lockfile` with `ERR_PNPM_IGNORED_BUILDS` for `@swc/core@1.16.22`. The locked transitive dependency comes from `next-intl`. pnpm 11's strict build policy requires an explicit decision for its native-binding postinstall.

Added only `'@swc/core@1.16.22': true` to the workspace `allowBuilds` map. Preserved the existing approval entries, strict build policy, Node.js 24, pnpm 11.9.0 and frozen install. pnpm 11.9.0's lockfile settings check does not include `allowBuilds`, and the dependency graph is unchanged, so the generated lockfile was preserved.

Static checks passed for the YAML approval, locked version, package manifest specifiers, frozen-install instruction and development Compose configuration. The sandbox's lockfile-only frozen check encountered registry DNS errors during supply-chain verification. The Docker build remains to be verified on the WSL host with `docker compose -p academy-dev -f compose.yaml -f infra/compose.dev.yaml build dev`.

### Dockerized quality check fixes

The WSL host confirmed the development image built with pnpm 11.9.0 and the frozen lockfile. Vitest passed all three tests. ESLint failed on the anonymous PostCSS default export. Both `next typegen` and the production build's TypeScript validation failed with `EACCES` on `/app/tsconfig.json`.

Next.js 16.4.5 writes suggested TypeScript options when absent. The project's missing `allowJs` option triggered that write. The dev image owned the `/app` directory as `node`, but the source copy left the image's `tsconfig.json` owned by root. Compose mounts only `app`, `src`, and `tests`, so WSL bind-mount permissions were not involved in this write.

Named the PostCSS config before exporting it, made `allowJs: false` explicit to preserve TypeScript-only checking, and copied dev image source and config files with ownership assigned to `node`. The runtime user stays non-root. Both generated route type paths and `next-env.d.ts` were already correct and are retained.

The PostCSS import, TypeScript config and Docker ownership assertions, and development Compose validation passed in the sandbox. The four Docker quality checks still need a WSL rerun against the rebuilt dev image. Phase 1 remains open.

### Database environment type check

The latest WSL Docker run passed the development image build, ESLint, and Next.js route type generation. TypeScript reported three TS2345 errors in `tests/unit/foundation.test.ts`, so Vitest and the production build did not run in that command chain.

`readDatabaseUrl()` previously accepted `NodeJS.ProcessEnv`. Next.js makes `NODE_ENV` required on that interface, although the function only reads `DATABASE_URL`. Narrowed the parameter to an optional `DATABASE_URL` and projected that field from `process.env` for no-argument callers. URL validation, redacted errors, and the existing test fixtures are unchanged.

Development Compose validation and static source checks passed. Lint, typecheck, Vitest, and the production build still need the Docker rerun on WSL. Phase 1 remains open. Phase 2 has not started.

### Final Phase 1 acceptance audit

The WSL host reported a successful Docker development build and frozen install, passing ESLint and TypeScript, passing Vitest (3/3), and a passing Next.js production build. PostgreSQL, Drizzle migrations and the running application were reported working. This session did not independently observe those runtime results.

Added a host-side acceptance runner at `infra/verify-phase1.sh`. It uses a uniquely named Compose project, a dedicated persistent volume, generated test credentials and no host port publication. It runs the existing smoke suite before writing a persistence marker, verifies Drizzle history and catalog privileges, checks liveness and failed readiness during a database outage, then recreates PostgreSQL and restarts the app to verify persistence and recovery. The smoke suite now checks both theme states and captures mobile navigation page errors.

Static checks passed for the runner's Bash syntax, resolved Compose isolation and volume, Git ignore rules, and absence of local database credential values from Git candidates. The existing web and migration images use the non-root Node user. The original architecture and course files retain their checksums. Git is initialized on `main` with no commits or configured remote. The session has no usable author identity.

**Phase 1 remains open.** The host-side script and enhanced Playwright tests have not run in this session. Review the WSL output and create the initial local commit before closing Phase 1. Phase 2 has not started.

### Phase 2 entry gate review

Phase 1 remains open. The latest WSL evidence in this repository still reports the successful frozen install, ESLint, TypeScript, Vitest (3/3), and Next.js production build. No final Playwright or isolated database acceptance output was present. The required bilingual browser checks, catalog database permissions, migration history, readiness during an outage, data persistence, and recovery still need recorded results.

The Phase 1 runner passed `bash -n`, and the base and development/test Compose configurations passed `config --quiet`. Requests to the local health and readiness endpoints could not connect from this session. A single `docker info --format '{{.ServerVersion}}'` check returned Docker socket permission denied. No escalation or daemon-dependent test was retried. Run `bash infra/verify-phase1.sh` on the WSL host and capture the output.

Git has staged Phase 1 files on `main` with no commits. The staged whitespace check flags three existing Markdown hard breaks in the original blueprint, which remains byte-for-byte preserved. Phase 2 has not started. No authentication dependencies, schema changes, or bootstrap commands were added.

### Phase 1 closure — WSL acceptance passed

Reviewed `/tmp/azaly-phase1-verification.log` for project `academy-verify-7cbdea396bb0`. The Docker build reused a successful frozen-install layer, lint and typecheck passed, Vitest passed 3/3, and production builds completed. Playwright passed 5/5, covering bilingual direction and language switching, mobile overflow and browser errors, both themes, readiness, empty and localized catalog results, and draft exclusion. Drizzle migrations succeeded on the isolated PostgreSQL database and on repeat application. Both locale routes and both probes returned HTTP 200. The web process ran as non-root. Catalog permissions passed. Stopping PostgreSQL kept liveness at 200 and changed readiness to 503. After database container recreation and web restart, readiness returned 200 and the marker row survived. The verification volume was retained. Phase 1 is complete. Git still has no initial commit.

## Phase 2 — COMPLETED

### Identity schema and permission boundary

Added the additive Drizzle migration `0001_identity`, its schema definitions and snapshot, and a rollback-only SQL permission test. The private identity schema defines users, accounts, sessions, verification records, the four roles, and privileged role-change audit records. The migration creates an authentication runtime group without login credentials. It permits identity and session operations while withholding role and account-status mutations and leaving administrative audit data outside the runtime group's grants. The catalog tables and existing catalog reader grants are preserved.

No Better Auth dependency, browser endpoints, database login, or Docker runtime wiring has been added in this slice. Verify the migration and the permission test on an isolated WSL database before wiring the adapter. Better Auth package compatibility, owner bootstrap, server-side RBAC and auditing policy, bilingual UI, and automated runtime acceptance remain pending. No live database or Docker volume was changed.

Static validation passed for migration order, snapshot linkage and catalog snapshot preservation, the new table names, and base Compose configuration. Phase 2 migration and SQL permission execution are still pending on WSL. See README.md for the isolated commands.

### Phase 2 Slice 1 — verified on WSL

The WSL host confirmed that `academy-identity-bfcbf405ed55` applied the Drizzle migrations twice successfully. The rollback-only identity permission test passed. Lint, type checking and Vitest passed in `academy-dev` with 3/3 tests.

### Phase 2 Slice 2 — Better Auth core and Owner bootstrap

Pinned Better Auth 1.7.27 and moved Drizzle ORM to 0.45.2 to satisfy the official adapter peer constraint. Added an additive migration guarding privileged registration fields and preventing removal, demotion, or banning of an active Owner. The catalog reader remains separate. The Docker CLI provisions an independent authentication login without rotating an existing password. Owner creation is transactionally serialized, hashes the password using Better Auth, and writes a role-change audit entry.

Exposed only email sign-up, email sign-in, sign-out, and a sanitized session summary. Sign-up uses the Student role, skips automatic sign-in, and returns the same success shape for duplicate email registration. Sessions are database-backed and HTTP-only, with secure cookies for HTTPS. Mutations enforce the configured origin and Better Auth checks. Added server-side checks for the four roles and constrained the Admin plugin custom roles. Admin endpoints, the bilingual UI, email delivery and the application user-management workflow are still pending.

Native Node RBAC assertions, source syntax, development and production Compose validation, and the isolated WSL runner and README Bash syntax passed. The lockfile still needs a WSL Docker refresh. The frozen build, quality checks, auth migration and permissions, bootstrap, HTTP smoke tests and Playwright have yet to run for Slice 2. No package installation or Docker runtime test was attempted inside the sandbox. No existing volume or reference course was modified.

### Phase 2 — full implementation ready for WSL verification

Slice 1 WSL evidence remains verified above. Completed bilingual login, registration, logout, profile and protected role dashboard routes. The Owner and Admin user-management view and API use the same server-side policy and PostgreSQL mutation function. The database rechecks the actor’s active session and target scope, serializes privileged mutations, revokes target sessions, and records role and suspension changes atomically. Public auth filters submitted fields and the localized login uses an allowlisted return path. Existing catalog schema and grants are unchanged.

Added Playwright coverage for both locales, failed login and logout, direct HTTP role denials, role and status revocation, expiry, and audit records. The isolated Phase 2 runner also verifies bootstrap, database permissions, the standalone production container, and session persistence across web restart. Email verification and recovery remain unavailable without mail delivery. Proxy client-IP and single-process rate-limit assumptions are documented in README.md.

At this checkpoint, Phase 2 was open for runtime verification. No packages were installed, no Docker runtime commands were executed in the sandbox, and no live volume was changed. The WSL lockfile refresh and acceptance commands are documented in README.md. Phase 3 has not started.

### Phase 2 registration smoke failure

Reviewed the WSL log. The refreshed frozen graph, builds, lint and typecheck, Vitest (7/7), repeatable migrations, database permissions, auth-login provisioning, and repeatable Owner bootstrap passed. The invalid-origin sign-up returned 403. The first valid-origin sign-up returned 503, stopping the run before later HTTP or browser checks.

The origin check runs after synchronous environment validation and pool construction. The retained log cannot distinguish an async Better Auth initialization error from a runtime handler or database error because the browser response was generic and the runner removed the container before printing logs. Added a TCP preflight under the actual authentication login, redacted Better Auth failure diagnostics, and capture of the last 50 web log lines before failed-run cleanup. No credentials or request payloads are logged by these diagnostics. Static Compose and shell validation and the diagnostic redaction assertion passed. The underlying registration failure remains unconfirmed until the isolated WSL rerun.

### Phase 2 registration request preparation fix

The WSL rerun verified TCP authentication and identity grants, then logged a TypeError in request preparation before Better Auth handled registration. Next.js 16.4.5 wraps dynamic route requests in a Proxy. Node 24.22.3's Undici Request constructor accesses private Request fields when passed the existing request object. The Proxy does not carry those fields, so the initial `new Request(request, { headers })` fails before payload parsing. The string-body construction does not require a duplex option.

The request builder now reads JSON through the incoming request's framework-supported accessor and constructs a fresh Request using its URL, copied headers, and the validated JSON string. Origin checks still run before preparation. A unit test uses a proxied streaming Request and checks field filtering, header preservation and malformed payload rejection. Syntax checks passed locally. The new Vitest test and isolated Phase 2 runtime rerun are pending on WSL.


### Phase 2 closure — 2026-11-22

**Phase 2 is COMPLETED and closed.** Reviewed the successful WSL Docker run of `bash infra/verify-phase2.sh` for isolated project `academy-auth-bc5e657777ab`, recorded in `/tmp/azaly-phase2-verification.log`.

| Check | Verified result |
| --- | --- |
| Frozen dependency installation and production images | Passed |
| ESLint and TypeScript | `eslint . --max-warnings=0` and `next typegen && tsc --noEmit` passed |
| Vitest | 3 files, 10/10 tests passed |
| Next.js production build | Passed |
| PostgreSQL and Drizzle | Migrations passed twice. Rollback-only permission checks and the `academy_auth` TCP login and grants preflight passed. |
| Auth login provisioning and Owner bootstrap | Provisioning passed. The first bootstrap created the Owner; the second preserved it. |
| HTTP authentication smoke | Registration, duplicate response, sign-in, roles, CSRF rejection, and logout passed. The Owner session survived an app restart and logout revoked it. |
| Playwright | 7/7 passed, including identity 2/2 and public portal 5/5. |

The successful runtime and browser checks supersede the earlier registration failure and pending verification entries. Phase 3 has not started.
