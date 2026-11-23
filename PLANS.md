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

## Phase 3 — COMPLETED

Added the bilingual browser course builder and protected authoring API. Instructors work on their own courses, Owners and Admins can work across courses, and guest and Student requests are denied. The builder supports independent Arabic and English metadata and content, ordering, draft preview, publication, republishing, withdrawal and archival. A separate database login executes only the scoped authoring command, which is owned by a non-superuser definer role with no login. Migration 0004 is additive and preserves the existing catalog reader and authentication grants. Complete publications create immutable snapshots and audit events. The public catalog only reads published metadata and omits withdrawn courses.

Added Vitest validation and role tests, rollback-only database permission checks, and a Playwright builder test for two unrelated courses created through the UI. The isolated WSL runner retains its own volume and publishes no ports. Bash syntax, source syntax for non-JSX TypeScript and JavaScript, Compose configuration, and migration metadata received local static checks. The initial static checks were followed by the WSL acceptance runs below.


### Phase 3 closure — 2026-11-23

**Phase 3 is COMPLETED and closed.** The first isolated WSL run, `academy-builder-a4a526d15f64`, surfaced lint findings. After those fixes, the isolated rerun `academy-builder-a5499c4fd4e3` passed `bash infra/verify-phase3.sh`. Evidence was reviewed in `/tmp/azaly-phase3-verification.log`.

| Check | Verified result |
| --- | --- |
| Quality and build | ESLint with zero warnings, Next.js route type generation, TypeScript, and the production build passed. |
| Vitest | 13/13 tests passed. |
| PostgreSQL | The additive authoring migration and migration replay passed. The rollback-only authoring permission checks passed. |
| Runtime | The isolated production web container passed the authentication smoke checks, including Owner session persistence across restart and revocation on logout. |
| Playwright regression | Identity and public portal suites passed 7/7. |
| Playwright course builder | 1/1 passed. It verified author scope and browser-only creation and bilingual publication of independent courses, draft isolation, republishing, withdrawal, and archival. |

The successful rerun supersedes the earlier lint failure and pending verification. Phase 4 has not started.

## Phase 4 — Completed

Implemented version-pinned enrollments, the bilingual learner player and My learning, lesson completion, bookmarks, resume across sessions, and the course-level quiz and grade history requested for this phase. Added optional localized multiple-choice questions to the course builder. Published revisions retain their own quiz definitions and private answer keys. New enrollments require a published structured snapshot. Existing enrollments continue using their pinned revision after a course is republished or withdrawn.

Migration 0005 adds learner records and a scoped database function owned by a restricted non-superuser role. The separate learner connection has no underlying table privileges. The function authenticates the Student and enforces enrollment ownership, grades selected answers against the pinned snapshot, and records immutable attempts. Catalog, identity and authoring runtime grants remain unchanged. No new npm dependencies were introduced.

Added Vitest policy checks, rollback-only PostgreSQL permission and grading tests, and a Playwright learner journey. The isolated Phase 4 runner also rehearses the prior browser suites. Local Bash, non-JSX source syntax, Compose configuration, and migration metadata checks were performed. The WSL runtime checks were pending at implementation time. The closure record follows.

### Application review and Phase 4 closure — 2026-11-23

Reviewed the implemented public, account, management, authoring and learner flows against the blueprint. Shared UI now lives in `app/_components`. Database queries, pool creation and command calls live in `src/db`. Services in `src/features` retain authorization and publication policy. The public query still selects the latest eligible published revision and its requested translation.

Fixed loss of the selected draft or enrollment across login and language changes. Guests can sign in from a course detail page and return there to enroll. Arabic and English account forms distinguish service outages from rejected submissions. The player constrains long code samples to their own scroll area on small screens. Publishing checks for started translations in lesson and quiz content as well as course metadata. CI now invokes the authenticated acceptance suites, and Playwright exercises the standalone server.

| Check | Observed result |
| --- | --- |
| `bash infra/verify-phase4.sh` | Final run exited 0 in isolated project `academy-learning-bcc7a9652c90`. Log at `/tmp/azaly-lms-review-final-20261123.log`. An earlier run identified an ambiguous alert selector. The final assertion checks the form itself. |
| Quality and build | Frozen dependency layer, zero-warning ESLint, route generation, TypeScript and production build passed. Vitest passed 16/16 across five files. |
| Database and HTTP | Migrations applied twice. Identity, authoring and learner SQL permission checks passed. Owner bootstrap was repeatable. Auth smoke verified origin enforcement, sign-in, session persistence across restart and revocation on logout. |
| Browser | Playwright passed 9/9 in Chromium. Seven public and identity tests, one course builder journey and one learner journey passed. The learner journey verified a 375px Arabic player with a long LTR code line, an Arabic/English round trip on the same enrollment and return to that enrollment after login. |
| Development stack | Read-only requests from the running `academy-dev` service returned HTTP 200 for `/api/health`, `/api/ready`, `/en/login`, `/ar/login` and `/api/auth/get-session`. Node pg connection and schema checks passed for the configured auth, authoring and learner roles. |
| Static and source checks | `git diff --check`, Bash syntax checks for the four phase runners and `docker compose -f compose.yaml -f infra/compose.dev.yaml --profile test config --quiet` passed. `git hash-object prometheus-grafana-course-bilingual.html` matched the tracked blob. |

The Phase 4 acceptance gate is complete. Authenticated write tests used the isolated database. Hosted CI execution, other browser engines, manual assistive-technology testing and production load testing were outside this run.

### Project review skills — 2026-11-23

Installed the code, test and documentation review skills under `.agents/skills` from `amElnagdy/guard-skills`. The installer arguments were `--repo amElnagdy/guard-skills --ref ffa26036b7b5e77b20b5d679304a703b6fd1a43d --dest .agents/skills --path skills/clean-code-guard skills/test-guard skills/docs-guard`.

For each installed directory, Codex's `quick_validate.py` passed and `diff -qr` against the pinned checkout found identical files (22 files in total). The upstream MIT notice was copied to `.agents/skills/guard-skills.LICENSE` and verified with `cmp`.

## Azaly LMS v0.2.0

Renamed the app to Azaly LMS in the localized shell, browser title, and About page. The navy and mint A mark in `app/icon.svg` serves as the header logo and browser icon. The localized footer reads version `0.2.0` from `package.json`. The wordmark and version number stay LTR in the Arabic interface. `AGENTS.md` documents the design skills, UI checks, version tagging, GitHub checks, and local stack rebuild.

- Vercel Web Design Guidelines installer arguments `--repo vercel-labs/agent-skills --ref 5a37a6329fbad3666c3207392a6a7c0110e92efb --dest .agents/skills --path skills/web-design-guidelines`.
- Anthropic Frontend Design installer arguments `--repo anthropics/skills --ref e4bb5d960d87126ff3b3a8af1a104b7db67560ba --dest .agents/skills --path skills/frontend-design`.
- UI/UX Pro Max pinned commit `6ec2bb58334ca3014573c4cbd4834ee3a40afd9d` from `nextlevelbuilder/ui-ux-pro-max-skill`. Ran its `generatePlatformFiles('/staging', 'codex')` renderer with Node.js 24 in an offline container and copied the generated `ui-ux-pro-max` directory into `.agents/skills`.

| Check | Observed result |
| --- | --- |
| Skill installation | `quick_validate.py` passed for all three. `cmp` verified both downloaded skill instructions and the generated Codex instructions. `diff -qr` matched the bundled UI/UX Pro Max data and scripts. The Vercel checklist matched its declared SHA-256. |
| UI/UX Pro Max | `python3 -B .agents/skills/ui-ux-pro-max/scripts/search.py 'online course' --domain product --rtl` returned the e-learning profile with partial RTL support. A separate `--stack nextjs` search returned framework guidance. |
| Development stack | `docker compose -p academy-dev -f compose.yaml -f infra/compose.dev.yaml up -d --build --wait dev` rebuilt and started the web service with the existing PostgreSQL volume. Once Next.js was listening, `/api/health` and `/api/ready` returned HTTP 200. The running container reported package version `0.2.0`. |
| Development browser | Chromium passed eight combinations of Arabic and English, widths of 375 and 1280 px, and light and dark themes. Each About page check verified the title, decoded logo, localized version and its LTR direction, visible keyboard focus, document direction, LTR code, and absence of horizontal overflow. |
| Isolated acceptance | `bash infra/verify-phase4.sh` exited 0 in `academy-learning-03e6b8bdb333`. Frozen install, lint, type checking, production build, 16 unit tests, migration replay, permission checks, and authentication smoke passed. Chromium passed 10 tests, including branding and release version in both locales. Log at `test-results/azaly-0.2.0-acceptance.ZSl6G0.log`. |
| Source preservation | `git diff --check` passed for project changes. The staged check flagged upstream whitespace in the pinned UI/UX Pro Max `scripts/design_system.py`, which was preserved verbatim. `git hash-object` matched `HEAD` for the original blueprint and course HTML. |

## Local sign-in repair

A sign-in submission reached the development server as GET before the client handler was ready. The form now declares POST explicitly and enables submission after hydration. The development server accepts loopback assets at `127.0.0.1` and omits account page queries from incoming request logs. The running app's authentication database returned an account count of zero.

| Check | Observed result |
| --- | --- |
| Local rebuild | `docker compose -p academy-dev -f compose.yaml -f infra/compose.dev.yaml up -d --build --wait dev` rebuilt the local service. `/api/health`, `/api/ready`, `/api/auth/get-session`, `/ar/login`, and `/en/login` returned HTTP 200 after startup. Both home pages displayed `0.2.0`. |
| Browser and logging | Chromium verified both sign-in and registration forms in Arabic and English at 375 and 1280 px in light and dark themes. The forms used POST, enabled submission after hydration, showed keyboard focus, and kept password inputs LTR. Both languages showed loading guidance and blocked submission with JavaScript disabled. A synthetic account query marker stayed out of the development log. |
| Isolated acceptance | `bash infra/verify-phase4.sh` exited 0 in `academy-learning-a1c51bd0fdf2`. Lint, type checking, production builds, 16 unit tests, migration replay, permissions, authentication smoke, and all 11 Chromium tests passed. Log at `test-results/azaly-auth-form-acceptance.dE7ZEu.log`. |

The first browser run exposed missing loading guidance in the JavaScript-disabled test. The corrected run passed after reclaiming Docker network slots from finished verification projects with `docker compose -p <test-project> -f compose.yaml -f infra/compose.dev.yaml --profile test down`. The verification data volumes were retained.

## Azaly LMS v0.3.0 — Closed registration and sign-in redesign

Reviewed the Hybrid Architecture MVP blueprint, the existing Better Auth and Drizzle setup, and `Azaly_LMS_SignIn_AdminOnly_Mockup.html`. The HTML stays at its original path as an offline reference. The release reuses the Azaly LMS icon, locale routes, secure sessions, theme cookie, and active Owner protection.

The centered sign-in, localized activation, and protected user directory share Navy and Mint tokens. The directory displays database counts and supports search, sorting, filtering, pagination, invitations, and audited edits. `OWNER` can manage `ADMIN`, `INSTRUCTOR`, and `STUDENT` accounts. `ADMIN` can manage instructors and learners. Role and status changes revoke the target's sessions. Registration returns HTTP 404 and the database denies direct runtime account inserts. Activation consumes a 48-hour token digest in the same transaction as account creation.

| Area | Added and updated files |
| --- | --- |
| Pages and shell | `app/[locale]/[account]/page.tsx`, `app/[locale]/activate/page.tsx`, `app/[locale]/admin/{page,users/page,reports/page}.tsx`, `app/[locale]/{layout.tsx,styles.css,account.css}`, `proxy.ts`, `next.config.ts` |
| UI | `app/_components/{account-icon,account-ui,admin-shell,auth-form,navigation,user-dialogs,user-directory}.tsx` |
| API and identity | `app/api/admin/users/route.ts`, `app/api/auth/{[...all],activate}/route.ts`, `src/features/identity/{auth,copy,directory,invitation-mail,management,request,return-path}.ts`. Removed unused `src/features/identity/actions.ts`. |
| Database | `src/db/{identity,identity-schema}.ts`, `src/db/migrations/0006_closed_registration.sql`, `src/db/migrations/meta/{0006_snapshot,_journal}.json` |
| Build and configuration | `.dockerignore`, `.env.example`, `compose.yaml`, `infra/compose.dev.yaml`, `package.json`, `playwright.config.ts` |
| Tests | `tests/e2e/{course-builder.spec,identity.spec,learning.spec,test-accounts}.ts`, `tests/integration/{auth-smoke.mjs,identity-permissions.sql,invitation-mail-capture.mjs}`, `tests/unit/auth-request.test.ts` |
| Documentation | `ARCHITECTURE.md`, `CODEX_HANDOFF.md`, `DATA_MODEL.md`, `PLANS.md`, `README.md`, `SECURITY_THREAT_MODEL.md` |

| Check | Observed result |
| --- | --- |
| UI design review | Ran `python3 -B .agents/skills/ui-ux-pro-max/scripts/search.py 'online course' --domain product --rtl` and `python3 -B .agents/skills/ui-ux-pro-max/scripts/search.py 'forms and accessibility' --stack nextjs`. Reviewed the mockup in Chromium and applied the bundled Web Design Guidelines to labels, live feedback, focus, dialog keyboard behavior, content direction, and mobile overflow. |
| Upgrade and schema | Applied migrations `0000`–`0005` to an isolated PostgreSQL 17 instance, seeded existing users, a credential and sessions, then applied `0006`. Existing credentials and sessions remained available. Verified restricted grants, Owner and Admin scope, session revocation, invitation single use, expiration, rotation and revocation, and the database rate limit. `pnpm db:generate` with the updated snapshot reported no schema changes. |
| Local stack | `docker compose -p academy-dev -f compose.yaml -f infra/compose.dev.yaml run --rm --build migrate` applied the migration. Rebuilt with `docker compose -p academy-dev -f compose.yaml -f infra/compose.dev.yaml up -d --build --wait dev` on the existing `academy-dev_postgres-data` volume. `/api/health` and `/api/ready` returned HTTP 200. Both home pages displayed `0.3.0`. Both localized registration URLs returned 404. |
| Local Chromium | Sign-in passed Arabic and English at 320px and 1280px in light and dark themes. Verified centered card, LTR credentials, logo, visible keyboard focus, password reveal, dialog dismissal and focus return, and no horizontal overflow. Final 320px account header measured 136px in both locales and themes. |
| Contrast | Checked the account palette pairs. Light and dark supporting copy measured 5.48:1 and 7.91:1. The mint button text measured 12.35:1. Darkened the light input boundary to reach 3.25:1 against the field surface. The dark boundary measured 4.06:1. |
| Isolated acceptance first pass | `bash infra/verify-phase4.sh` passed lint, type checking, 16 unit tests, production builds, migration replay, database grants and HTTP auth smoke. Nine of 11 Chromium tests passed. Corrected the ambiguous no-JavaScript field locator and waited for the System theme update before reloading. Log at `test-results/azaly-0.3.0-acceptance.T4lhyR.log`. |
| Isolated acceptance retry | All 12 identity and public browser tests passed. The course-builder suite found the same password locator ambiguity in its existing sign-in helper. Updated the authoring and learner helpers to target the exact field label. Log at `test-results/azaly-0.3.0-acceptance.c73f7M.log`. |
| Isolated acceptance completed | `bash infra/verify-phase4.sh` exited 0 in `academy-learning-d1e4f71a989f`. Frozen dependency install, lint, type check, 16 unit tests, production builds, migration replay, three database permission checks, origin rejection and session restart smoke passed. Chromium passed 14 tests, including 12 identity and public tests and the authoring and learning suites. Sign-in and the admin directory passed both locales, 320px and 1280px, and System, Light and Dark themes. Log at `test-results/azaly-0.3.0-acceptance.g1pGbA.log`. |
| Final images | `docker compose -p academy-dev -f compose.yaml -f infra/compose.dev.yaml build web` and `docker compose -p academy-dev -f compose.yaml -f infra/compose.dev.yaml up -d --build --wait dev` passed with the final contrast adjustment. Both probes returned HTTP 200 after the rebuild. Chromium confirmed the final field border, displayed version, document direction, and no overflow at 320px in both locales and themes. Log at `test-results/azaly-0.3.0-images.uzpEET.log`. |
| Source preservation | `git diff --check` passed. The original blueprint and course HTML Git hashes match `HEAD`. SHA-256 of the supplied sign-in mockup remains `6d8193c1eb8fea093ce1059dcb38133f61d321146733b044a5034794ccacd48e`. |

The local `.env` has no invitation mail credentials. The isolated browser runner uses a loopback mail capture service. Production setup requires a verified sender, API key, reachable mail endpoint, and the canonical HTTPS origin. See the [invitation setup](README.md#provision-accounts-by-invitation).

## Phase 5 — Reusable assessments and Guided Labs

Scope approved from the `v0.3.0` baseline at `4ab5e4e`. Migration `0007_assessments_guided_labs` adds an author-scoped question bank, Guided Lab attempts, and immutable review records. The course builder copies reusable questions into drafts and freezes the copies and bilingual Guided Lab templates on publication. Learners work against their pinned revision. A submitted attempt keeps the original self-reported evidence and checkpoints alongside the instructor’s separate decision. Application policies and scoped PostgreSQL functions enforce ownership and provenance.

| Check | Observed result |
| --- | --- |
| Design and review | Ran UI/UX Pro Max product search with `--rtl` and Next.js stack search with `--stack nextjs`. Used the existing builder and player styles for the new views. Reviewed labels, keyboard controls, form feedback, reading direction, and code scrolling against the bundled Web Interface Guidelines. |
| Initial migration and build | Applied SQL migrations `0000` through `0007` on a fresh PostgreSQL 17 container. The first complete gate attempt passed lint, types, unit tests, builds, and migration replay. The new rollback-only SQL test exposed a JSONB operator-precedence error in bank validation. Added parentheses and verified the Phase 5 permissions test on a fresh isolated PostgreSQL instance. Initial log at `test-results/azaly-phase5.QaD1hA.log`. |
| Upgrade and metadata | A separate isolated upgrade from `0006` to `0007` retained seeded users, credential hashes, and sessions and kept direct registration denied. `pnpm db:generate` with the new Drizzle snapshot reported no schema changes. |
| Browser retry | The second isolated run passed 28 unit tests, all rollback-only permission tests, HTTP auth smoke, and all 14 prior browser tests. The new journey exposed an unstable control label after editing a Guided Lab textarea. Associated each textarea with an explicit label and restarted the gate. Log at `test-results/azaly-phase5.NVM0lV.log`. |
| Final WSL gate | `bash infra/verify-phase5.sh` exited 0 in `academy-phase5-40ebe7dde078`. The frozen dependency build, zero-warning ESLint, type checking, production builds, 28 Vitest tests, migration replay through `0007`, four rollback-only SQL permission suites, closed-registration and restart smoke tests, and 15 Chromium tests passed. Log at `test-results/azaly-phase5.P6NpgD.log`. |
| Phase 5 browser coverage | Verified the question bank, builder, review queue, and player in Arabic and English, Light and Dark, at 320px and 1280px. The player also passed at 375px. Verified keyboard focus on scrollable LTR code, a bilingual quiz and lab publication, grading with the original published key after a bank edit and archive, saved checkpoints and evidence across reload and sign-in, and the separate instructor review. Direct HTTP checks rejected guest access, cross-scope requests and forged provenance. |

**Phase 5 WSL verification gate passed.** The runner used a new Compose project and volume. The Phase 5 changes are in the working tree. The released `v0.3.0` baseline and existing development volume remain outside this run.

### Phase 5 changed files

| Area | Files |
| --- | --- |
| Localized routes and styles | `app/[locale]/builder/page.tsx`, `app/[locale]/guided-reviews/page.tsx`, `app/[locale]/question-bank/page.tsx`, `app/[locale]/styles.css` |
| Shared UI | `app/_components/content-request.ts`, `app/_components/course-builder.tsx`, `app/_components/guided-lab-authoring.tsx`, `app/_components/guided-labs.tsx`, `app/_components/learning.tsx`, `app/_components/ordered-fields.tsx`, `app/_components/question-bank.tsx` |
| HTTP | `app/api/content-response.ts`, `app/api/guided-reviews/route.ts`, `app/api/learning/guided-labs/route.ts`, `app/api/question-bank/route.ts` |
| Domain | `src/features/assessment/copy.ts`, `src/features/assessment/policy.ts`, `src/features/assessment/service.ts`, `src/features/authoring/policy.ts`, `src/features/authoring/service.ts`, `src/features/guided/copy.ts`, `src/features/guided/policy.ts`, `src/features/guided/service.ts`, `src/features/identity/return-path.ts`, `src/features/learning/service.ts` |
| Database | `src/db/authoring-schema.ts`, `src/db/authoring.ts`, `src/db/learning-schema.ts`, `src/db/learning.ts`, `src/db/migrations/0007_assessments_guided_labs.sql`, `src/db/migrations/meta/0007_snapshot.json`, `src/db/migrations/meta/_journal.json` |
| Verification | `infra/compose.dev.yaml`, `infra/verify-phase4.sh`, `infra/verify-phase5.sh`, `tests/e2e/identity.spec.ts`, `tests/e2e/phase5.spec.ts`, `tests/e2e/test-accounts.ts`, `tests/integration/phase5-permissions.sql`, `tests/unit/phase5.test.ts` |
| Documentation | `ACCEPTANCE_TESTS.md`, `ARCHITECTURE.md`, `CODEX_HANDOFF.md`, `DATA_MODEL.md`, `PLANS.md`, `SECURITY_THREAT_MODEL.md` |

### Azaly LMS v0.4.0 release preparation

Set `package.json` to `0.4.0`. The localized footer and its Playwright check both read the manifest. The version search found no tests or documentation that treated `0.3.0` as the current footer version. CI and local acceptance now use `bash infra/verify.sh`, which delegates to the Phase 5 runner. The Phase 2–5 runner hashes match the checkout before release preparation.

| Command or check | Observed result |
| --- | --- |
| `bash infra/verify.sh` | Exited 0 on WSL2 in `academy-phase5-847bb4b870b2`. The standalone image reported `0.4.0`. Frozen install, lint, type checking, production builds, 28 Vitest tests, migration application and replay, four rollback-only SQL permission suites, authentication smoke and restart persistence, and 15 Chromium tests passed. Chromium verified the release footer in both locales and ran the complete Phase 5 journey. Log at `test-results/azaly-0.4.0-verify.uPrJ0u.log`. |
| `docker compose -p academy-dev -f compose.yaml -f infra/compose.dev.yaml run --rm --build migrate` | Exited 0. Drizzle's migration count increased from 7 to 8, and the database recorded the SHA-256 of `0007_assessments_guided_labs.sql` exactly once. |
| `docker compose -p academy-dev -f compose.yaml -f infra/compose.dev.yaml up -d --build --wait dev` | Exited 0. The rebuilt service reported package version `0.4.0`. The original PostgreSQL container and its `academy-dev_postgres-data` volume were retained. Both Compose commands are in `test-results/azaly-0.4.0-dev.MDY82c.log`. |
| HTTP probes and localized home pages | `/api/health` returned HTTP 200 with `{"status":"ok"}`. `/api/ready` returned HTTP 200 with `{"status":"ready"}`. `/ar` and `/en` returned HTTP 200 and rendered the localized footer with `0.4.0` in LTR text. The Arabic page was RTL and the English page was LTR. |
| `git diff --check`, Bash syntax, and CI YAML checks | Passed. The workflow's pre-migration HTTP 503 check and Compose restart persistence check match the previous workflow. |

Release changes are uncommitted on `feat/phase5-release`. GitHub-hosted **Foundation checks** await a push, and the `v0.4.0` tag requires operator approval.
