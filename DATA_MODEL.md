# Data model

Phase 1 creates course identity with a unique slug, immutable publication revisions by course and revision number, and one title and summary per revision and locale. A nullable publication timestamp distinguishes drafts from published revisions. Public queries select the newest published revision first and then require an exact translation. A missing translation does not reveal a draft or an earlier revision. Authenticated authoring will enforce immutability and add ownership and visibility policy before granting mutation access.

Later phases add users and scoped role assignments, localized categories, ordered modules, lessons and validated content blocks, private assets, version-bound enrollments and progress, and immutable quiz attempts. Stable logical identifiers support deliberate progress migration. Lab template versions define labMode. Lab attempts record completionProvenance and reference immutable check results. Lab instances retain opaque resource identifiers and lifecycle timestamps.

Phase 2 starts with an additive migration in the `identity` schema. The user row stores one global role and account status. Credential accounts, sessions and verification records follow Better Auth's core data model. Role-change audit records retain actor and target IDs, the previous and new roles, and the event time. The authentication runtime group has no direct permission to change roles or account status. Course-scoped assignments remain separate from the global role.

Administrative status changes also store previous and new suspension values in the audit record. A role or suspension change invalidates the target's sessions in the same transaction.
