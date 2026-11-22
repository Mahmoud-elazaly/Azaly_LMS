# Architecture

The Hybrid Architecture MVP blueprint governs this project. The optional master prompt and execution roadmap were absent at inventory. The blueprint uses “phase 1.1” in its lab section and “Phase 7” in its delivery plan. Phase 7 is the execution phase and Hybrid v1.1 is the release. Canonical public course details use the locale prefix. The existing HTML stays at its original path outside app and public.

The LMS is a modular monolith. App Router renders public pages and HTTP probes. The catalog module owns public reads. Drizzle schema, connection setup and migrations live under src/db. PostgreSQL runs on a private network. Interface strings use next-intl. Course translations belong to individual published revisions. Use native semantic controls and Tailwind styling. Portal layouts for learners and staff will be added behind server-side access policies.

Phase 1 serves published catalog metadata and a legitimate empty state. Publishing and authoring arrive in Phase 3. Enrollment and course delivery arrive in Phase 4. Storage, background jobs and lab controller deployment enter only when their feature gates require them.

The development and verification toolchain runs inside Docker. The development service bind-mounts application source and uses a separate Compose project from production. Chromium runs in a dedicated image with a separate test database. Production installs the frozen pnpm lockfile and uses an internal data network for PostgreSQL.

Phase 2 adds Better Auth behind `/api/auth`, with a separate auth database pool and a sanitized session endpoint. The identity module owns localized account views, role-aware API and Server Action boundaries, and user management. Both administrative mutation entry points call the same audited database operation. Scoped course permissions join this boundary when course assignments exist.

Phase 3 keeps authoring in the modular monolith. The bilingual builder submits commands to the authoring API through a separate database login. A scoped PostgreSQL function verifies the active actor session and course ownership before any draft read or write. Instructors can author courses they create. Owners and Admins can work across courses. The public catalog still reads version metadata under its existing read-only role.
