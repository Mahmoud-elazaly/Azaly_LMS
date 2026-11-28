# Azaly LMS application handover

**Reviewed 2026-11-28.** The released baseline is Phase 12, `v1.1.0`, at merge commit `41ed76e9423f17175e514459a876c7f3945977d5`. Azaly LMS is a self-hosted Arabic and English LMS for infrastructure and DevOps training. It ships a public catalog, invitation-only accounts, course authoring, learner progress and assessments, Guided Labs, isolated multi-track Real Labs, course import, mastery analytics, and mock technical interviews. [Release](https://github.com/Mahmoud-elazaly/Azaly_LMS/releases/tag/v1.1.0) · [Phase 12 PR](https://github.com/Mahmoud-elazaly/Azaly_LMS/pull/12) · [Roadmap](ROADMAP.md)

## Where each role starts

| Role | First review | Decisions and deliverables |
| --- | --- | --- |
| Software architect | Published content lifecycle, database role separation, lab execution boundary, and Gemini data flow | Assess changes to trust boundaries, data ownership, compatibility, and deployment topology. Carry accepted decisions into the architecture and threat model. |
| Software lead | Feature map, acceptance tests, and the latest release evidence | Identify affected routes and all callers, check migration and backward compatibility, review authorization and localization, and keep existing acceptance coverage intact. |
| Orchestrator | Delivery workflow and the operating state below | Track scope, dependencies and gate evidence. Coordinate the feature branch, required CI, merge, release, and environment verification under the repository workflow. Keep this handover current when the work closes. |

Read the repository instructions and Hybrid Architecture MVP blueprint before changing scope. Use the roadmap for sequencing and the acceptance criteria and recorded commands to verify progress. [Repository instructions](AGENTS.md) · [Hybrid Architecture MVP blueprint](IT_Engineering_Academy_Hybrid_Architecture_MVP.md) · [Acceptance tests](ACCEPTANCE_TESTS.md) · [Execution evidence](PLANS.md)


## Phase 11 hardening

Phase 11 sets the package version to `1.0.0` and passed the local cumulative platform gate. It adds scoped ownership for the identity routines, a shared sign-in budget, bounded JSON processing, and browser privacy controls. Migration `0012_identity_definer_hardening` uses the existing `academy` database and is required before deployment. [Phase 11 evidence](PLANS.md#phase-11--production-readiness-security--release-hardening) · [Version release record](https://github.com/Mahmoud-elazaly/Azaly_LMS/releases/tag/v1.0.0) · [Production security audit](SECURITY_THREAT_MODEL.md#phase-11-production-security-audit)

## Phase 12 multi-track Real Labs

Version `1.1.0` adds the Linux file permissions and Prometheus metrics exposition exercises alongside NGINX. Migration `0013_multi_track_real_labs` adds the template links and enables the new checker pairs in the existing database. The lab bridge and controller must use the updated worker protocol and the controller must use the newly approved sandbox image ID before the updated app enables starts. [Lab architecture](LAB_ARCHITECTURE.md#phase-12-multi-track-workspaces) · [Phase 12 evidence](PLANS.md#phase-12--multi-track-real-labs-expansion)

## Release and operating state

| Check | Observed for `v1.1.0` |
| --- | --- |
| Delivery | PR #12 merged after the required `Foundation checks / verify` job passed. The annotated release tag points to the merge commit. |
| Cumulative gate | `bash infra/verify.sh` exited 0 with 65 unit tests, 26 Chromium tests, eleven PostgreSQL permission suites, and six historical upgrade rehearsals. |
| Local development | Applied migration `0013`, rebuilt the approved lab sandbox, and updated the lab controller, bridge, and app. The original PostgreSQL container and `academy-dev_postgres-data` remained in use. The database has 14 applied migrations. |
| Smoke checks | `/api/health` and `/api/ready` returned HTTP 200. `/ar` and `/en` returned HTTP 200 and showed `1.1.0` in the footer. Direct registration returned 404 and guest lab access returned 401. |
| Live interview generation | `GEMINI_API_KEY` is unset on the reviewed development stack. Automated interview verification used the deterministic server-side Gemini stub. |

[Phase 12 gate and deployment evidence](PLANS.md#phase-12--multi-track-real-labs-expansion) · [GitHub check](https://github.com/Mahmoud-elazaly/Azaly_LMS/actions/runs/46091580033)

## System boundaries

- **Application.** The Docker-first Next.js App Router application is a modular monolith. UI and HTTP routes live in `app/`, policies and services in `src/features/`, and PostgreSQL access, Drizzle schemas, and migrations in `src/db/`. Better Auth serves account sessions. Use the committed Dockerfile and manifests for runtime and package versions. [Architecture](ARCHITECTURE.md) · [Dockerfile](Dockerfile) · [Package manifest](package.json) · [Lockfile](pnpm-lock.yaml)
- **Identity and database.** Each deployment uses a single PostgreSQL database named `academy` on a private network. Catalog, authentication, authoring, learner, and lab-bridge runtime connections have scoped privileges. Reserve the database owner for migrations and provisioning. Sensitive SQL commands use non-login `SECURITY DEFINER` owners, private grants, a fixed search path, and live session and ownership checks. Public registration is closed. Owners and Admins provision invitations under their role policies. [Data model](DATA_MODEL.md) · [Threat model](SECURITY_THREAT_MODEL.md) · [Configuration template](.env.example)
- **Publication and progress.** Staff edit private drafts and publish immutable localized snapshots. Public reads use the latest eligible published revision and the exact requested locale. Learner enrollments pin a revision. The server grades private assessment keys against that snapshot, and earlier enrollments retain their history after republishing. [Publication and learner model](DATA_MODEL.md)
- **Labs.** Guided Labs supply instructions and retain self-reported or instructor-reviewed completion provenance. Real Labs use a bridge and controller on the isolated execution plane with scoped grants, approved templates, expiry, and cleanup. The versioned NGINX, Linux permissions, and Prometheus exposition exercises share these boundaries. Keep the Docker socket, worker credentials, and lab execution outside the LMS web process. [Lab architecture](LAB_ARCHITECTURE.md)
- **Interviews and mastery.** Student-scoped routes use selected Knowledge Graph concepts, published lesson extracts, and a role and seniority rubric. Gemini runs on the server. The database reserves write capacity and token budgets and persists owned transcripts and validated scorecards. Weak concepts from the latest completed interview covering their track can affect mastery and remediation. Review the Gemini data flow with any change to grounding, logging, or transcript retention. [Interview architecture](ARCHITECTURE.md#phase-10-mock-interviews) · [Interview data model](DATA_MODEL.md#phase-10-interviews-and-mastery-evidence) · [Interview trust boundary](SECURITY_THREAT_MODEL.md#phase-10-interview-trust-boundary)
- **Bilingual workspace.** Public and authenticated pages use the `/ar` and `/en` prefixes. Preserve Arabic RTL and English LTR, explicit LTR for technical content, the existing sidebar, keyboard navigation, and Light, Dark, and System themes. Keep the original HTML references at their offline paths. [Repository instructions](AGENTS.md) · [Original course reference](prometheus-grafana-course-bilingual.html) · [Original sign-in reference](Azaly_LMS_SignIn_AdminOnly_Mockup.html)

## Feature map

| Area | Start in the repository |
| --- | --- |
| Public catalog and account lifecycle | `app/[locale]/courses/`, `app/api/auth/`, `app/api/admin/users/`, `src/features/identity/`, `src/db/public-catalog.ts` |
| Course authoring, deterministic Markdown/ZIP import, and reusable assessments | `app/[locale]/builder/`, `app/[locale]/question-bank/`, `app/api/authoring/`, `src/features/authoring/`, `scripts/import-course.ts` |
| Learner player, Mermaid diagrams, quizzes, and Guided Labs | `app/[locale]/learning/`, `app/_components/lesson-markdown.tsx`, `app/api/learning/`, `app/[locale]/guided-reviews/`, `src/features/learning/`, `src/features/guided/` |
| Real Lab catalog and worker | `app/[locale]/real-lab/`, `app/api/real-lab/`, `src/features/real-lab/`, `infra/real-lab/`, `infra/compose.lab.yaml` |
| Knowledge Graph and mastery | `app/[locale]/knowledge-graph/`, `app/[locale]/mastery/`, `app/api/mastery/`, `src/features/mastery/` |
| Mock Interviewer | `app/[locale]/interview/`, `app/api/interview/[operation]/route.ts`, `src/features/interview/`, `src/db/interview-schema.ts`, `src/db/migrations/0011_mock_interviews.sql` |
| Release and quality | `infra/verify.sh`, `tests/unit/`, `tests/integration/`, `tests/e2e/`, `.github/workflows/ci.yml`, `.github/workflows/release.yml` |

## Development, verification, and deployment

1. **Set up the environment.** Follow the Docker setup and provisioning instructions. Copy configuration structure from `.env.example` and supply actual credentials through the ignored environment or deployment secret store. Configure Gemini only in the server environment. Preserve the active Compose project, environment files, lab overlay if enabled, and named PostgreSQL volume during updates. [Docker development](README.md#docker-development) · [Self-hosted deployment](README.md#self-hosted-deployment) · [Real Lab setup](README.md#enable-the-nginx-real-lab-pilot)
2. **Verify changes through the shared gate.** Run `bash infra/verify.sh` from the repository root. This is the cumulative local and CI entrypoint and uses an isolated test database. Add regression coverage for changed behavior and record observed commands and outcomes in `PLANS.md`. For UI changes, check Arabic and English, Light, Dark, and System themes, keyboard focus, mobile and desktop overflow, and LTR code rendering. [Acceptance tests](ACCEPTANCE_TESTS.md) · [CI workflow](.github/workflows/ci.yml)
3. **Deliver through the repository workflow.** Use a dedicated branch from synced `main`. Require the `verify` job, use GitHub auto-merge as specified, and record the PR, merge SHA, and release tag. Release automation reads the version in `package.json`. Apply new migrations through the Compose migration service and rebuild with the active overlays. [Autonomous delivery workflow](AGENTS.md#autonomous-delivery-workflow) · [Release workflow](.github/workflows/release.yml)
4. **Check the environment after deployment.** Confirm `/api/health`, `/api/ready`, and both locale footers. Readiness covers the catalog database connection and schema, so verify the affected signed-in workflow separately when checking authentication, authoring, learning, labs, or interview generation. [Deployment instructions](README.md#self-hosted-deployment)

## Open operational items

- The local interview service needs a configured server-side `GEMINI_API_KEY` to exercise live generation. Treat captured stub runs and a live provider check as separate evidence. [Interview acceptance](ACCEPTANCE_TESTS.md#phase-10-mock-interviewer)
- Restore, monitoring, load, and security checks remain prerequisites for external enrollment. The roadmap and operating documentation govern that decision. [Roadmap](ROADMAP.md) · [Reverse proxy and operations](README.md#reverse-proxy-and-operations)

## Keeping this handover current

Review this file with each application or operational change. In the same change, update any affected release status, system boundary, feature path, environment setting, deployment step, or open item. Keep detailed commands, test outcomes, and unresolved blockers in `PLANS.md` and link to the relevant entry here. Once a release or deployment is verified, refresh the release and operating state with the observed version, commit, check results, and evidence links. Keep secrets and private transcripts out of the handover. [Maintenance rule](AGENTS.md#maintaining-the-handover) · [Execution evidence](PLANS.md)
