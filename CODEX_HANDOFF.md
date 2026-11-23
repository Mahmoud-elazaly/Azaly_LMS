# Codex handoff | Azaly LMS

Last reviewed **2026-11-23**. Repository `/home/azaly/Azaly-LMS`. The handoff reflects the current workspace and the available WSL verification logs. Use [PLANS.md](PLANS.md) for formal phase status and historical evidence, [ROADMAP.md](ROADMAP.md) for gates, and [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md) for required checks. Read [AGENTS.md](AGENTS.md) and the [Hybrid Architecture MVP blueprint](IT_Engineering_Academy_Hybrid_Architecture_MVP.md) before changing scope.

## Where to resume

- **Phases 0–4 are complete.** The published `v0.3.0` baseline is commit `4ab5e4e` on `origin/main`.
- **Phase 5 is implemented and verified on WSL.** It adds a reusable question bank and Guided Labs with separate self-reported and instructor-reviewed records. The changes are in the working tree. See PLANS.md for the successful isolated gate and file inventory.
- **The `v0.4.0` release is prepared on `feat/phase5-release`.** The unified WSL gate passed, and `academy-dev` runs `0.4.0` with migration `0007` applied. The release is uncommitted. See [release verification](PLANS.md#azaly-lms-v040-release-preparation).

## Project and architecture

Azaly LMS is a self-hosted bilingual LMS for infrastructure and DevOps training. It uses a Docker-first modular monolith. Next.js App Router serves the public catalog, authenticated accounts, the course builder, and the student player. The application modules live under `src/features/`. PostgreSQL is the system of record. Drizzle defines the tables and provides versioned migrations, while scoped SQL functions enforce sensitive database boundaries.

The committed toolchain uses Node.js 24 in Docker, Corepack with pnpm 11.9.0, Next.js 16.4.5, React 19.2.8, TypeScript 5.9.3, Tailwind 4.3.3, next-intl 4.5.6, Better Auth 1.7.27, Drizzle ORM 0.45.2, drizzle-kit 0.31.7, and PostgreSQL 17. Read exact pins in [package.json](package.json) and [pnpm-lock.yaml](pnpm-lock.yaml). Runtime and test installations use the frozen lockfile. [pnpm-workspace.yaml](pnpm-workspace.yaml) explicitly allows selected dependency builds, including `@swc/core@1.16.22`. Keep pnpm's strict build policy.

The root uses the saved locale and defaults to `/ar`. Locale-prefixed pages use Arabic RTL or English LTR, and code renders LTR in both. Interface text and course content are authored independently for both languages. Light, dark, and system theme preferences use a cookie. The public catalog only exposes the newest eligible revision and its requested locale. The original [bilingual Prometheus and Grafana HTML](prometheus-grafana-course-bilingual.html) stays at its original path as offline source material. It is outside the site's routes and Docker build input.

The preferred deployment is a trusted TLS reverse proxy in front of the loopback-bound web service. PostgreSQL is on the internal Compose data network with a named volume and no published host port. The web, dev, browser, and migration runtime processes use the non-root Node user. The web image runs Next.js standalone via `node server.js`. The dev service bind-mounts app, source, and tests read-only. Rebuild the appropriate image when manifests, root configuration, or migrations change.

Guided Labs are intended for learner-managed infrastructure with explicit completion provenance. The future Real Lab controller and terminal gateway belong in a separately isolated execution plane. The LMS web process must never receive a Docker socket, privileged orchestration credentials, or arbitrary shell execution. See [LAB_ARCHITECTURE.md](LAB_ARCHITECTURE.md) and [SECURITY_THREAT_MODEL.md](SECURITY_THREAT_MODEL.md).

## Phases and delivered features

| Phase | Status and features |
| --- | --- |
| 0 | Complete. Architecture, threat model, database boundaries, source preservation, delivery gates, and deployment assumptions documented. |
| 1 | Closed. Docker-first foundation, bilingual public Home, About and catalog, published course detail pages, theming, PostgreSQL migrations, liveness/readiness, quality tooling, and CI. |
| 2 | Closed. Email/password sign-in/sign-out, sanitized session endpoint, account and role dashboards, Owner bootstrap, suspension/restoration and audited role changes. Version 0.3.0 replaces registration with administrator invitations. |
| 3 | Closed and pushed. Browser authoring in both languages, structured paragraph/heading/code/callout blocks, module/lesson/block ordering, protected preview, draft saves, publishing, republishing, withdrawal and archival. Verified two unrelated courses created and published entirely through the browser. |
| 4 | Closed. Bilingual enrollment, My learning, course player, completion, bookmarks, resume, localized quizzes, server-side grading, and private grade history. |
| 5 | WSL gate passed. Scoped question bank, versioned course copies, Guided Lab authoring and attempts, and an instructor review queue. Gate evidence is in PLANS.md. |
| 6–8 | Planned. Phase 6 delivers a curated Prometheus/Grafana learning path. Phase 7 pilots an isolated NGINX Real Lab. Phase 8 covers restore drills, monitoring, capacity and security hardening before external enrollment. |

### Role and publishing decisions

- `OWNER` can administer Admins, Instructors, and Students. `ADMIN` manages Instructors and Students. The active Owner cannot be removed, demoted, or suspended. The privileged identity mutation rejects self-management, updates the account, revokes target sessions, and records the audit event in one transaction.
- `OWNER` and `ADMIN` author across courses. `INSTRUCTOR` is scoped to courses they created. Existing catalog entries were backfilled into unassigned drafts for Owners/Admins. There is no separate instructor-assignment UI. `STUDENT` is required for enrollment, player access, bookmark/completion changes, and quiz attempts. The learner service derives ownership from the active session, not from a submitted Student ID.
- Authoring uses optimistic draft versions to prevent stale writes. A single publication transaction freezes a curriculum snapshot, projects localized metadata to the catalog, updates visibility/order, and writes an audit event. A slug can change before its first publication. Withdrawal and archival hide the course and retain its history. A partial locale is kept out of the catalog instead of falling back to a previous revision.
- Each enrollment is pinned to the structured published revision chosen at enrollment. Republishing does not silently upgrade existing learners or discard their progress. Withdrawal blocks new enrollment while existing learners can still read their pinned content. Older catalog-only entries must be republished with a structured snapshot before accepting a new enrollment.
- Quiz definitions travel with the immutable publication. There are no mutable answer-key tables in the learner surface. The database projects the requested locale's prompts and choices, grades against the private key, and records the selected answers and score. A replay of the same attempt ID and answers returns the original grade. The UI currently authors two choices per question, and the validation/API accept two to four. Translated choices must keep the same semantic order because the correct index is shared.

## File map

| Files | Responsibility |
| --- | --- |
| [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), [DATA_MODEL.md](DATA_MODEL.md), [SECURITY_THREAT_MODEL.md](SECURITY_THREAT_MODEL.md) | WSL operation, component boundaries, persistent data, and security rationale. |
| `app/[locale]/layout.tsx`, `app/[locale]/styles.css`, `src/i18n/{locales,messages}.ts`, `app/_components/navigation.tsx`, `app/_components/{theme,theme-action}.ts` | Bilingual layout, navigation and account links, direction, theme, and shared styling. Each feature has its own localized copy. |
| `app/[locale]/courses/`, `src/db/public-catalog.ts`, `src/db/client.ts` | Public catalog and course details under the read-only pool. A signed-in Student can enroll from course details. |
| `app/[locale]/[account]/page.tsx`, `app/[locale]/activate/page.tsx`, `app/[locale]/admin/`, `app/_components/auth-form.tsx`, `src/features/identity/` | Localized sign-in, invitation activation, profile, role pages and user management. Includes session policy, account mutations and mail integration. |
| `app/api/auth/[...all]/route.ts`, `app/api/admin/users/route.ts`, `app/api/instructor/route.ts` | Allowlisted auth endpoints, administrative user management, and Instructor-only identity endpoint. Better Auth's generic admin endpoints remain closed. |
| `app/[locale]/builder/page.tsx`, `app/_components/course-builder.tsx`, `app/api/authoring/route.ts`, `src/features/authoring/` | Draft editor and safe preview, localized quiz editing, validation, publish policy and authoring service. |
| `app/[locale]/learning/page.tsx`, `app/_components/learning.tsx`, `app/api/learning/route.ts`, `src/features/learning/` | Enrollment, localized player and grade history, lesson operations, ownership and quiz submission contracts. |
| `app/[locale]/question-bank/`, `app/[locale]/guided-reviews/`, `app/api/question-bank/`, `app/api/guided-reviews/`, `app/api/learning/guided-labs/`, `src/features/{assessment,guided}/` | Private reusable questions, Guided Lab authoring and learner progress, and scoped instructor review. |
| `src/db/{schema,identity-schema,authoring-schema,learning-schema}.ts`, `src/db/env.ts`, `drizzle.config.ts`, `src/db/migrations/` | Table declarations, redacted URL validation, migration configuration, additive SQL, snapshots and migration journal. |
| `scripts/identity-admin.mjs`, `infra/postgres/10-catalog-reader.sql`, `.env.example` | Idempotent Owner initialization, separate database-login provisioning, fresh-volume catalog reader initialization, and credential placeholders. |
| `Dockerfile`, `compose.yaml`, `infra/compose.dev.yaml`, `.dockerignore`, `next.config.ts` | Build targets, private DB network, isolated test browser, bind mounts, image context, standalone output, and HTTP headers. |
| `infra/verify-phase{1,2,3,4}.sh`, `tests/{unit,integration,e2e}/`, `playwright.config.ts`, `vitest.config.ts`, `.github/workflows/ci.yml` | WSL acceptance runners, rollback-only SQL checks, HTTP smoke and browser tests, and baseline GitHub CI. |

## Database schema and relationships

| Schema | Relationships and invariants |
| --- | --- |
| `public` | `courses` has a unique slug, catalog order and nullable withdrawal timestamp. Each course has many `course_versions`, unique by course and positive revision number. Each version has at most one `course_translations` row per `ar` or `en` locale. Public reads require an eligible publication timestamp, an active course, and an exact translation. |
| `identity` | `user` has a unique email, role enum and suspension state. `account` and `session` belong to the user. Provider/account identity and session tokens are unique. `verification` is the Better Auth verification store. `audit_event` records actor/target IDs, old/new role and suspension state, and time. |
| `authoring` | `drafts` has one mutable JSONB document per course, optional instructor owner, edit version and archival timestamp. `snapshots` has one immutable JSONB document per published version. Stable module, lesson, block, quiz and question IDs live inside these documents. `events` records course, optional version, actor, publication/withdrawal/archival action, and time. |
| `learning` | `enrollments` links one Student/course pair to one published version and stores the resume lesson ID. `lesson_progress` uses `(enrollment_id, lesson_id)` as its key and stores completion time and bookmark state. `attempts` references enrollment and a quiz ID in its snapshot. It stores submitted choices, bounded score and total, and grading time. Grade history reads these append-only attempts. |

Applied migration sequence and intent:

- `0000_catalog.sql` creates public courses, revisions and translations.
- `0001_identity.sql` creates the identity tables and authentication boundary. `0002_identity_guards.sql` protects privileged registration fields and the active Owner. `0003_identity_management.sql` adds the audited identity mutation and suspension history.
- `0004_authoring.sql` adds draft/snapshot/event tables, course order and withdrawal, existing-course draft backfill, and the restricted author command.
- `0005_learning.sql` adds learner tables, session/ownership-scoped commands and database grading.
- `0006_closed_registration.sql` closes direct runtime account creation and adds invitation, audit and account rate-limit storage. Keep applied migrations immutable. Add new migrations, journal entries, and matching Drizzle snapshots for changes to persistent schema.
- `0007_assessments_guided_labs.sql` adds reusable bank questions, Guided Lab attempts and immutable reviews, and validation of Guided Lab templates in private draft and snapshot documents.

### Runtime credentials and authorization

| Connection | Database privilege |
| --- | --- |
| Migration service `DATABASE_URL` | Database owner for DDL, login provisioning, and bootstrap. This credential is confined to the migration container in deployment. |
| Web `DATABASE_URL` | `academy_reader` reads eligible catalog tables. No identity, authoring, or learner mutation access. |
| `AUTH_DATABASE_URL` | `academy_auth` inherits `academy_auth_runtime`. Restricted identity access and the scoped management function. No direct role or account-status updates. |
| `AUTHORING_DATABASE_URL` | `academy_author` inherits `academy_authoring_runtime`. Executes `authoring.course_command` without direct table access. Non-superuser `academy_authoring_definer` owns the function. |
| `LEARNER_DATABASE_URL` | `academy_learner` inherits `academy_learner_runtime`. Executes `learning.student_command` without direct table access. Non-superuser `academy_learner_definer` owns the function. |

Protected endpoints check the active Better Auth session and canonical roles in application code. Scoped SQL functions recheck the session and applicable object ownership and use a fixed search path. POST mutations check the configured origin. Missing authentication returns `401`, while the wrong role or cross-account access returns `403`. Learner requests reject client-supplied ownership and grade data. Progress writes require a lesson in the enrolled snapshot.

Better Auth uses a seven-day session with a one-day refresh age and cookie caching disabled. Cookies are HttpOnly and SameSite=Lax, with Secure set for HTTPS. Auth exposes email sign-in, sign-out, invitation activation and token-free session summaries. Return paths are restricted to allowed paths in the same locale. Keep all actual secrets in ignored `.env` or the deployment secret store. Maintain distinct URL-safe database credentials. Never put session tokens, request bodies, SQL parameters, or real passwords into application logs or handoff notes.

## WSL evidence and test operation

| WSL run | Evidence |
| --- | --- |
| Phase 1 `academy-verify-7cbdea396bb0` | `/tmp/azaly-phase1-verification.log`. Quality checks and build passed. Vitest 3/3 and Playwright 5/5 passed. Locale routes returned 200. Liveness stayed 200 while PostgreSQL was stopped. Readiness went 200 → 503 → 200, and the seeded row survived database container recreation. |
| Phase 2 `academy-auth-bc5e657777ab` | `/tmp/azaly-phase2-verification.log`. Frozen install, lint/typecheck/build, Vitest 10/10 and Playwright 7/7 passed. Migration replay, login permissions, idempotent bootstrap, origin rejection, session restart persistence and logout revocation passed. |
| Phase 3 `academy-builder-a5499c4fd4e3` | `/tmp/azaly-phase3-verification.log`. After lint fixes, lint/typecheck/build, Vitest 13/13, migration replay, rollback-only authoring permissions, HTTP smoke and Playwright 8/8 passed. |
| Phase 4 `academy-learning-314356cfc6d8` | `/tmp/azaly-phase4-verification.log`. Reviewed frozen build layers, zero-warning ESLint, route type generation, TypeScript and production build. Vitest 16/16 across five files. Migrations passed twice. All three permission-test files completed with rollback. Database logins, repeated Owner bootstrap, TCP/grant preflight and standalone auth smoke passed. Playwright passed 7/7 identity/public, 1/1 authoring, 1/1 learning. |
| Application review `academy-learning-bcc7a9652c90` | `/tmp/azaly-lms-review-final-20261123.log`. Exit 0, all 16 unit and 9 browser tests passed. See PLANS.md for commands and coverage. |
| Azaly LMS v0.2.0 `academy-learning-03e6b8bdb333` | `test-results/azaly-0.2.0-acceptance.ZSl6G0.log`. Exit 0, all 16 unit and 10 browser tests passed. See PLANS.md for branding, version, and local rebuild checks. |
| Phase 5 `academy-phase5-40ebe7dde078` | `test-results/azaly-phase5.P6NpgD.log`. Exit 0, 28 unit tests and 15 browser tests passed. SQL permissions and migration replay through `0007` passed. See PLANS.md for the full gate. |

The learner browser test covers protected redirects, refusal to enroll in a draft, Arabic enrollment and RTL/LTR rendering, bookmarking, progress persistence after reload, resume in a separate signed-in browser context, answer-key exclusion, rejection of a client-supplied score, grade history, and cross-student denial for reads, progress, and submissions.

The Phase 4 runner creates a uniquely named Compose project and fresh PostgreSQL volume, generates temporary credentials, and publishes no host ports. It prints container logs on failure, removes its one-off web/browser containers, stops the test stack, and retains its isolated volume. It runs browser groups separately to keep sign-in rate-limit buckets independent. Playwright uses Chromium on container-local `127.0.0.1:3100` and captures invitation mail on loopback. Auth tests require isolated Owner configuration, and `PHASE3_TEST=1` and `PHASE4_TEST=1` enable the respective suites. An ordinary Playwright invocation can show skips and does not prove the whole gate.

The Docker browser stage now inherits `dependencies` and installs Chromium and OS dependencies before copying source. The Phase 4 log shows a successful cold Chromium install and passing E2E with that layer order. Docker reused the Chromium installation layer during the application review rerun. The production web image keeps its standalone server. Playwright now runs the standalone server with the built static assets, matching the production image entry point.

## Known limitations and open items

- GitHub CI runs `bash infra/verify.sh` for the full platform gate, including Phase 5 assessment and Guided Lab coverage.
- `/api/health` signals process liveness. `/api/ready` currently checks the catalog pool and catalog schema only. A healthy response alone does not validate auth, authoring, or learner credentials.
- Better Auth sign-in limits are per process. Invitation activation and management limits use PostgreSQL. Terminate TLS through a trusted proxy that overwrites `X-Academy-Client-IP` with the verified client IP and keeps the web port private. Requests without a usable address share the loopback bucket. See [invitation setup](README.md#provision-accounts-by-invitation) for mail configuration.
- Switching language preserves the selected draft or enrollment and translates validated sign-in return paths.
- Assessment authors must maintain equivalent answer ordering across languages. Enrollment upgrades are deliberate. Private media delivery, Phase 6 content curation, the Real Lab controller, and production restore and monitoring remain roadmap items.

## Exact next steps

1. **Rerun on WSL if source changes or evidence needs reconfirmation.** Use the isolated runner and retain the exit status when capturing logs:

   ```bash
   cd /home/azaly/Azaly-LMS
   set -o pipefail
   bash infra/verify.sh 2>&1 | tee /tmp/azaly-lms-verification.log
   ```

2. **Review the checkout before any commit.** On the WSL host:

   ```bash
   cd /home/azaly/Azaly-LMS
   git status --short --branch
   git diff --check
   git diff --stat
   git ls-files --others --exclude-standard
   git check-ignore .env
   ```

   Review the actual diff and new files. Stage and commit only with authorization. If the managed Codex sandbox reports a read-only `.git` directory or denied Docker socket, use the WSL host session. Keep existing volumes and project names. Avoid volume-removal flags.
3. **For a separately authorized deployment**, follow [README.md](README.md#phase-4-learner-experience-on-wsl) to migrate and provision the learner login against the intended existing project. Update the environment and recreate its web container. Verify both HTTP probes and exercise a real authenticated learner flow. Do not reuse test passwords or restore test fixtures into an existing deployment.
4. **Review the Phase 5 gate evidence in PLANS.md.** Review the author scope, submission and review constraints, and published snapshot behavior before a release. Phase 6 content curation needs its own scope approval. The NGINX execution pilot remains in Phase 7.

## Keeping this handoff current

Update this file alongside `PLANS.md` after each verified milestone, migration, role/grant change, test-runner change, or confirmed blocker. Include the commands, run identity, date, and actual test outcomes. Distinguish isolated test evidence, formal phase closure, commit/push status, and deployment status. Keep real credentials and private logs outside the repository.
