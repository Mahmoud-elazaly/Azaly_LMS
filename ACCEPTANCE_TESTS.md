# Acceptance tests

Phase 0 requires documented architecture and trust boundaries, preserved references, documented dependency choices and startup paths.

Phase 1 requires frozen install, lint, type checking, unit tests, production build and Playwright smoke tests against migrated PostgreSQL. Verify English LTR, Arabic RTL, locale switching, theme persistence, responsive navigation, draft exclusion, empty catalog, localized published details, and unavailable slugs. Verify readiness returns 200 after migrations and 503 with unavailable database or missing schema. Verify a local Compose start and persistence across service restart.

Subsequent gates are in ROADMAP.md. Auth gates require direct HTTP negative tests for student access to admin actions and instructor cross-course access. Before Real Labs, prove access isolation, quotas, external grading, expiration, cleanup and orphan reconciliation.

Phase 2 verification runs through `bash infra/verify-phase2.sh` on WSL. The isolated run checks additive migrations and rollback-only database permissions, idempotent Owner bootstrap, email/password auth, session persistence across application restart, logout and expiry, Arabic and English pages, protected redirects, direct HTTP authorization, session revocation after role and status changes, and audit records. It also reruns the public Phase 1 Playwright tests. Phase 2 closes only after the frozen Docker build and all these checks pass.

For Phase 3 run `bash infra/verify-phase3.sh` on WSL. The isolated run checks migration replay, independent catalog/auth/authoring privileges, Student and guest denial, cross-instructor denial, stale writes, and browser authoring of two unrelated courses. It checks independent bilingual publication, draft isolation, republishing, withdrawal and archival. It reruns the Phase 1 and Phase 2 browser checks before the builder tests.

Run `bash infra/verify-phase4.sh` on WSL for Phase 4. It rehearses migration replay, checks runtime role separation and server grading within a rollback-only SQL transaction, reruns prior Playwright suites, and tests bilingual enrollment, persisted progress and bookmarks, cross-device resume, grade history, answer key exclusion, and unauthenticated and cross-student denial.

Run `bash infra/verify.sh` on WSL for the full platform gate used by CI. The cumulative runner extends the Phase 5 runner, which creates a dedicated Compose project and database volume, uses container-local listeners, and prints service logs on failure. The runner applies and replays migrations through `0008`, runs all rollback-only permission tests, and exercises the standalone production build with the existing auth smoke test. It reruns identity, public, course-builder, and learner coverage before the Phase 5 Chromium suite.

- Author and import a bilingual bank question through the UI, publish the course, edit and archive the source, then grade the learner quiz using its original frozen key. Verify the learner response excludes the key and explanation.
- Publish a bilingual Guided Lab with LTR command and starter text. Check mobile and desktop width, localized content, checkpoint persistence, optional learner evidence, and the explicit self-reported label.
- Verify that a scoped Instructor can review a self-reported attempt and that the learner sees the original evidence alongside the immutable review. Send negative HTTP and SQL requests for guest access, role escalation, cross-student access, private bank access, cross-instructor review, and `SYSTEM_VERIFIED`.

## Phase 6 curated learning path

Run `bash infra/verify.sh` from WSL. The gate retains the checks from Phases 1–5. Phase 6 adds the following checks.

- Validate two independent lesson translations, shared LTR examples, 12 aligned bank questions in four assessments, and four Guided Labs.
- Stage the draft concurrently on the migrated v0.4.0 schema. Confirm public exclusion in Arabic and English, reject enrollment into the draft, preserve existing users, credentials, and sessions, and confirm registration remains closed. Verify publication and replay create one initial snapshot and leave later staff edits intact.
- Enroll through the catalog and visit all 14 lessons in both locales. Complete lessons, resume across locale and browser changes, grade all four assessments on the server, and verify the player HTML and API projection exclude private answer keys and explanations.
- Save and resume checkpoints, complete all four Guided Labs, submit with and without evidence, and review the recovery lab as its scoped Instructor. Preserve the original evidence with the review. Deny cross-course review, forged provenance, and direct runtime access to private course, bank, and lab tables.
- Check the catalog, course details, learner player, builder, question bank, and review queue at 320px and 1280px in both locales and themes. Verify outline mirroring, keyboard focus, labeled controls, horizontal code scrolling, and page reflow.
- Run the learner-facing Compose configuration in a disposable practice project. Check Prometheus and Alertmanager configuration, scrapes, Grafana data-source health, the static error ratio and p95, a recording rule, and the pending, firing, and recovery transitions.

Observed results and reference hash checks are recorded in [PLANS.md](PLANS.md).

## Phase 7 isolated NGINX pilot

Run `bash infra/verify.sh` for the complete gate. Phase 7 adds these checks.

- Apply the v0.5.0 migration history to an isolated database, add existing-course and identity fixtures, and apply and replay migration `0008`. Compare the course, user, credential, invitation, and session rows. Confirm direct registration still returns 404.
- Prove PostgreSQL role separation, one-use workspace grants, start idempotency, per-learner concurrency denial, same-learner second-session denial, and rejection of a stale verification after expiry.
- Launch the actual NGINX sandbox in Chromium. Deny another learner and another session access to configuration, preview, verification, stop, and reset. Deny caller verdicts and alternate destinations. Exercise the failing starter, apply the approved blue route, verify the live response, and confirm `SYSTEM_VERIFIED`. Send a delayed edit directly to the test worker after verification and confirm the verified route stays fixed.
- Verify stop, reset, expiry, and authentication-session revocation. Inspect the sandbox's resource limits, UID, mounts, network namespace, and route isolation. Restart the controller with an orphan and confirm reconciliation removes it. Verify automatic expiry and removal with both control services stopped.
- Check the lab in Arabic and English at 320px and 1280px in Light and Dark. Confirm mirrored editor and preview columns, accessible controls, focus, feedback, and LTR input and output.

The observed gate results and the `academy-dev` upgrade are recorded in [PLANS.md](PLANS.md#phase-7--isolated-nginx-real-lab-pilot).

## Phase 8 lesson diagrams, assessments and import

Run `bash infra/verify.sh` for the cumulative gate. The Phase 8 gate first applies the v0.6.0 migration history, then applies and replays `0009` and compares existing identity, course, grade, Guided Lab and Real Lab fixtures.

- Render a Mermaid fence and an invalid fence in Arabic and English. Exercise zoom, keyboard panning, and reset. Check the builder preview, learner player, and bank in Light and Dark at 320px and 1280px. Verify LTR diagrams, snippets, and CLI inputs.
- Create both new question types in the bank, import copies into a draft, and verify mixed assessment grading against pinned snapshots. Direct learner requests must reject caller-supplied grades and cross-account use. Assert that learner HTML and JSON exclude faulty lines, CLI grading rules, explanations and source bank IDs.
- Test exact faulty-line sets, whitespace outside quotes, independent flag order, and whole-command regex matching. Keep all earlier multiple-choice and lab checks active.
- Run the importer without database configuration in dry-run mode. Compare deterministic output across ZIP entry orders and confirm ignored files and unmatched quiz entries have structured warnings. Apply, replay, publish through the builder, and reimport a changed source. Confirm the existing snapshot survives and a subsequent manual draft edit causes a conflict.
- Verify the scoped import function and private grading helpers through a rollback-only SQL test. The test covers author ownership, learner denial, grade scope and the absence of public grants. Closed registration continues to return HTTP 404.

Observed results are recorded in [PLANS.md](PLANS.md#phase-8--lesson-diagrams-assessments-and-course-import).

## Phase 9 cross-track knowledge graph and mastery

Run `bash infra/verify.sh` for the cumulative Phase 1–9 gate. `bash infra/verify-phase9.sh` runs the same checks. The gate applies the v0.7.0 migration history to an isolated database, applies and replays `0010`, and compares fingerprints for existing identity, imported drafts, publication snapshots, enrollments, grades, and both lab models. It reruns closed-registration HTTP checks and all prior browser and SQL suites.

- Assert the seeded concept and relation counts and reject invalid, duplicate, self, and dangling edges. Check ontology table privileges, the definer role and search path, public revocation, and execution denial for other runtime roles.
- Compare two independent Student sessions. Verify pinned lesson completion, mapped MCQ, `find_bug`, and `cli_recall` outcomes from the latest immutable quiz attempt, Guided Lab review, and `SYSTEM_VERIFIED` Real Lab credit. Confirm the mastery projection excludes private answers, rubric fields, evidence, and feedback. Deny expired, banned, impersonated, and staff sessions.
- In Chromium, exercise track and relationship filters, zoom, keyboard and pointer panning, and drawer dismissal and focus return. Follow deep links to an exact lesson, quiz, and Guided Lab. Check that a failed quiz offers a retry and that a passing retry and Guided Lab submission update both score and next practice while a second learner’s queue stays unchanged.
- Check both learner routes in Arabic and English, Light and Dark, at 390×844, 1280×800, and 1440×900. Verify page reflow, accessible filters, the six-domain radar text key, and LTR graph geometry within the mirrored Arabic shell.

[Observed Phase 9 results](PLANS.md#phase-9--cross-track-knowledge-graph-and-mastery)

## Phase 10 mock interviewer

`bash infra/verify.sh` runs the cumulative gate through `infra/verify-phase10.sh`. It rehearses the upgrade from `v0.8.0`, applies and replays migration `0011_mock_interviews`, and compares the historical fixture and ontology fingerprints.

- Unit checks cover strict Zod output validation, scoped grounding, supplemental labels, request size and turn validation, provider caps and error handling, and interview evidence in mastery.
- PostgreSQL checks verify private table grants and routine ownership, expired and staff session refusal, cross-user isolation, published lesson projection, concurrent and stale reservations, and per-learner rate and session budget enforcement.
- Chromium drives the full flow through the loopback Gemini stub, including a malformed scorecard followed by recovery, persisted history, another learner’s isolated view, and Knowledge Graph and Weakest Concepts updates. It checks keyboard focus and the Arabic and English setup and scorecard in Light and Dark at 390×844, 1280×800 and 1440×900. [Observed gate results](PLANS.md#phase-10--server-side-ai-mock-technical-interviewer)
