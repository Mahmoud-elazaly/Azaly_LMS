# Acceptance tests

Phase 0 requires documented architecture and trust boundaries, preserved references, documented dependency choices and startup paths.

Phase 1 requires frozen install, lint, type checking, unit tests, production build and Playwright smoke tests against migrated PostgreSQL. Verify English LTR, Arabic RTL, locale switching, theme persistence, responsive navigation, draft exclusion, empty catalog, localized published details, and unavailable slugs. Verify readiness returns 200 after migrations and 503 with unavailable database or missing schema. Verify a local Compose start and persistence across service restart.

Subsequent gates are in ROADMAP.md. Auth gates require direct HTTP negative tests for student access to admin actions and instructor cross-course access. Before Real Labs, prove access isolation, quotas, external grading, expiration, cleanup and orphan reconciliation.

Phase 2 verification runs through `bash infra/verify-phase2.sh` on WSL. The isolated run checks additive migrations and rollback-only database permissions, idempotent Owner bootstrap, email/password auth, session persistence across application restart, logout and expiry, Arabic and English pages, protected redirects, direct HTTP authorization, session revocation after role and status changes, and audit records. It also reruns the public Phase 1 Playwright tests. Phase 2 closes only after the frozen Docker build and all these checks pass.

For Phase 3 run `bash infra/verify-phase3.sh` on WSL. The isolated run checks migration replay, independent catalog/auth/authoring privileges, Student and guest denial, cross-instructor denial, stale writes, and browser authoring of two unrelated courses. It checks independent bilingual publication, draft isolation, republishing, withdrawal and archival. It reruns the Phase 1 and Phase 2 browser checks before the builder tests.

Run `bash infra/verify-phase4.sh` on WSL for Phase 4. It rehearses migration replay, checks runtime role separation and server grading within a rollback-only SQL transaction, reruns prior Playwright suites, and tests bilingual enrollment, persisted progress and bookmarks, cross-device resume, grade history, answer key exclusion, and unauthenticated and cross-student denial.

Run `bash infra/verify.sh` on WSL for the full platform gate used by CI. It invokes the Phase 5 runner, which creates a dedicated Compose project and database volume, uses container-local listeners, and prints service logs on failure. The runner applies and replays migrations through `0007`, runs all rollback-only permission tests, and exercises the standalone production build with the existing auth smoke test. It reruns identity, public, course-builder, and learner coverage before the Phase 5 Chromium suite.

- Author and import a bilingual bank question through the UI, publish the course, edit and archive the source, then grade the learner quiz using its original frozen key. Verify the learner response excludes the key and explanation.
- Publish a bilingual Guided Lab with LTR command and starter text. Check mobile and desktop width, localized content, checkpoint persistence, optional learner evidence, and the explicit self-reported label.
- Verify that a scoped Instructor can review a self-reported attempt and that the learner sees the original evidence alongside the immutable review. Send negative HTTP and SQL requests for guest access, role escalation, cross-student access, private bank access, cross-instructor review, and `SYSTEM_VERIFIED`.
