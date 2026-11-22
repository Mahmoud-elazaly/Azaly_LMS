# Security threat model

| Threat | Boundary or control |
| --- | --- |
| Anonymous reader accesses unpublished content | Public catalog queries require published revision and matching locale |
| Secret exposure | Runtime-only database configuration, redacted readiness responses and untracked env files |
| Direct database access | Internal Compose network and persistent database storage without a production host port |
| Active legacy content | HTML remains outside App Router, public and Docker build input |
| Browser embedding or content sniffing | Deny framing, disable MIME sniffing and terminate TLS at trusted reverse proxy |
| Future cross-account or cross-course access | Enforce server-side object-level policy and test direct requests |
| Future lab escape or resource exhaustion | Dedicated isolated lab zone, quotas, deny-by-default traffic, signed templates and cleanup reconciliation |
| Future forged grades or stolen grants | External trusted checker and expiring one-use attempt grants |

The initial single-host deployment assumes trusted operators and a trusted TLS proxy. Backups and restore drills are operator responsibilities. Public learner access remains gated on later identity and production hardening.

The identity schema is private to the migration owner and explicitly granted roles. The authentication runtime group has no login of its own and receives no catalog privileges. The catalog reader receives no identity schema privileges. Role and account-status mutations are withheld from the runtime group until the server-side administration policy is implemented and tested. The migration provisions no default users or secrets.

Administrative mutations use a narrow PostgreSQL function through the auth runtime login. It validates an active actor session and checks actor and target roles while holding locks. The function blocks self-management and Owner mutations, limits administrators to Student and Instructor accounts, and commits the mutation, session deletion and audit record together. It uses a fixed search path and grants EXECUTE only to the auth runtime group and its owner. Authenticated pages recheck the database-backed session and use a locale-specific allowlist for sign-in return paths.

The authoring runtime can execute a single scoped function and has no direct draft, catalog-write, or identity table grants. The function runs as a non-superuser role without login and applies role and course ownership policy using the current session. Builder mutations require the configured origin. Publication cannot overwrite an earlier snapshot. The builder renders structured text through React, and code blocks render LTR.
