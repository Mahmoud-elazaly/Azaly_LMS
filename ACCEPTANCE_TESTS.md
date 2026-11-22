# Acceptance tests

Phase 0 requires documented architecture and trust boundaries, preserved references, documented dependency choices and startup paths.

Phase 1 requires frozen install, lint, type checking, unit tests, production build and Playwright smoke tests against migrated PostgreSQL. Verify English LTR, Arabic RTL, locale switching, theme persistence, responsive navigation, draft exclusion, empty catalog, localized published details, and unavailable slugs. Verify readiness returns 200 after migrations and 503 with unavailable database or missing schema. Verify a local Compose start and persistence across service restart.

Subsequent gates are in ROADMAP.md. Auth gates require direct HTTP negative tests for student access to admin actions and instructor cross-course access. Before Real Labs, prove access isolation, quotas, external grading, expiration, cleanup and orphan reconciliation.

Phase 2 verification runs through `bash infra/verify-phase2.sh` on WSL. The isolated run checks additive migrations and rollback-only database permissions, idempotent Owner bootstrap, email/password auth, session persistence across application restart, logout and expiry, Arabic and English pages, protected redirects, direct HTTP authorization, session revocation after role and status changes, and audit records. It also reruns the public Phase 1 Playwright tests. Phase 2 closes only after the frozen Docker build and all these checks pass.
