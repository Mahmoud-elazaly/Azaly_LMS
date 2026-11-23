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

The identity schema is private to the migration owner and explicitly granted roles. The authentication runtime group has no login of its own and receives no catalog privileges. The catalog reader receives no identity schema privileges. Runtime account provisioning and role and status changes require scoped PostgreSQL functions. Management functions recheck the actor's active session and enforce the Owner and Admin boundaries. Disabling an account or changing its role revokes its sessions in the same transaction as the audit event.

Invitation tokens carry 256 bits of randomness and expire after 48 hours. The database stores their SHA-256 digests and restricts digest reads to privileged functions. The activation link carries the token in its URL fragment, and the activation form sends it only in a POST body. Activation and administrative mutations validate the configured origin and use PostgreSQL rate limits. The email API key is supplied to the web service through runtime configuration.

Administrative mutations use a narrow PostgreSQL function through the auth runtime login. It validates an active actor session and checks actor and target roles while holding locks. The function blocks self-management and Owner mutations, limits administrators to Student and Instructor accounts, and commits the mutation, session deletion and audit record together. It uses a fixed search path and grants EXECUTE only to the auth runtime group and its owner. Authenticated pages recheck the database-backed session and use a locale-specific allowlist for sign-in return paths.

The authoring runtime executes scoped functions. The functions run as a non-superuser role without login and apply session, role, and ownership checks for course drafts, bank items, and Guided Lab reviews. Builder and review mutations require the configured origin. Publication creates a fresh snapshot. The builder renders structured text through React, and code blocks render LTR.

The learner login executes scoped learner functions owned by a non-superuser role without login. Each verifies the Student identity and enrollment ownership before returning progress, writing a mutation, or recording a grade. The learner quiz projection contains IDs, prompts, and options. The answer key, rationale, and bank content stay private. Grade and completion writes derive their actor from the active session, and the HTTP mutations require the configured origin.

Guided Lab writes independently enforce role, enrollment, pinned lab membership, allowed checkpoints, and provenance in application policy and PostgreSQL. The learner path can record `SELF_REPORTED`, and the scoped review path writes `INSTRUCTOR_REVIEWED` to a separate append-only record. The constraints admit only those respective values. Submitted evidence remains attached to its original learner attempt. Phase 5 reserves `SYSTEM_VERIFIED` for the future external checker boundary. Runtime logins have no direct grants on bank, snapshot, Guided Lab attempt, or review tables.

Phase 6 adds an operator-only seed job using the existing migration service. It selects an existing active author, leaves identity records untouched, and makes the first curated publication only after an explicit publish command or a staff action in the builder. Runtime grants stay unchanged. The practice services bind to learner-local loopback, use a locally generated Grafana password, and route the exercise alert to a receiver without a delivery destination.

| Phase 7 threat | Enforcement |
| --- | --- |
| Cross-learner or cross-session workspace access | The learner function locks the live authenticated Student session and checks attempt ownership and the launch session. The bridge redeems a ten-second, one-use grant and rechecks expiry and session validity. |
| Arbitrary destination, command or proxy content | The learner API accepts one allowlisted NGINX directive. The gateway forwards a named operation and an approved upstream identifier. The controller uses fixed Docker arguments and returns a bounded text preview. |
| Sandbox access to LMS data, admin or metadata surfaces | The sandbox has loopback only, with no published listener or host mounts. It uses a non-root UID, read-only root, bounded tmpfs, no added capabilities, and resource limits. |
| Forged verification | The bridge database role can execute the trusted job functions. The web learner login can queue a check and read the projected outcome. A matching active lease, approved checker version, and both observed criteria are required for system provenance. The worker locks a passing configuration before returning the result so an in-flight edit cannot change it. |
| Crash or abandoned resources | The bridge retries failed destruction and reconciles namespaces with durable attempts. The sandbox exits at its deadline with Docker auto-removal. The controller also sweeps expired instances from its label inventory. |
| Privileged Docker access | The controller is the only service with a Docker socket. Use a dedicated worker host for deployed labs. The bridge authenticates to a private HTTPS worker endpoint and holds a separate scoped PostgreSQL login. |

The local lab profile exercises the worker on the existing Docker host with a dedicated control network. It is intended for development and acceptance. The deployment requires a separate worker and private authenticated HTTPS connectivity. Complete restore and security acceptance before enrollment outside the controlled pilot.

| Phase 8 threat | Enforcement |
| --- | --- |
| Active lesson content | Markdown skips raw HTML and image elements. Mermaid disables author-supplied configuration directives and uses `securityLevel: 'strict'`. The generated SVG is displayed as an image. Unrenderable diagrams retain their readable source. |
| Forged score or rubric disclosure | The existing learner definer validates the active Student and enrollment, reads the private snapshot and grades bounded typed answers. The explicit learner projection includes prompts, choices and practice snippets. CLI answers are compared as text. |
| Archive traversal or decompression abuse | ZIP paths are checked and entries are read in memory. Entry count, archive size, per-file size and total expanded text are bounded. Non-regular files and binary artifacts are ignored. |
| Import privilege or draft overwrite | The import function checks the live staff session and ownership under the existing non-login authoring definer role. The runtime gets execute access. Published snapshots go through publication, and the import digest protects staff-edited drafts. |
