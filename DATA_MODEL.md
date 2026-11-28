# Data model

Phase 1 creates course identity with a unique slug, immutable publication revisions by course and revision number, and one title and summary per revision and locale. A nullable publication timestamp distinguishes drafts from published revisions. Public queries select the newest published revision first and then require an exact translation. A missing translation does not reveal a draft or an earlier revision. Authenticated authoring will enforce immutability and add ownership and visibility policy before granting mutation access.

Later phases add users and scoped role assignments, localized categories, ordered modules, lessons and validated content blocks, private assets, version-bound enrollments and progress, and immutable quiz attempts. Stable logical identifiers support deliberate progress migration. Lab template versions define labMode. Lab attempts record completionProvenance and reference immutable check results. Lab instances retain opaque resource identifiers and lifecycle timestamps.

Phase 2 starts with an additive migration in the `identity` schema. The user row stores one global role and account status. Credential accounts, sessions and verification records follow Better Auth's core data model. Role-change audit records retain actor and target IDs, the previous and new roles, and the event time. The authentication runtime group has no direct permission to change roles or account status. Course-scoped assignments remain separate from the global role.

Migration `0006_closed_registration` adds `identity.invitation`, `identity.account_rate_limit` and an audit action field. Each open invitation has a unique normalized email, assigned role, preferred locale, expiration time and token digest. Activation writes the user and its credential and closes the invitation in one transaction. Closing an invitation clears its digest. Existing user IDs, credentials and sessions keep their original rows.

Administrative status changes also store previous and new suspension values in the audit record. A role or suspension change invalidates the target's sessions in the same transaction.

Phase 3 adds private authoring drafts, immutable snapshots, and publication events. A draft stores an ordered JSON document of stable module, lesson, and block IDs with independent Arabic and English fields. Draft changes use an optimistic edit version. Publishing creates a fresh course version and copies public metadata to the existing translation table in the same transaction as the snapshot and audit event. Course order becomes public on publish. Withdrawal or archival hides the course while retaining its revision history. The slug is editable until the first publication. Existing catalog rows seed unassigned drafts that Owners and Admins can edit.

Phase 4 adds enrollments unique by Student and course, pinned to a published revision. The enrollment records the last opened lesson. Lesson progress and bookmarks use stable lesson IDs scoped to that enrollment. Quiz and question definitions, localized options, and the answer key are frozen in the private publication snapshot. Each attempt records the enrollment, quiz ID, selected answers, server score, total and grading timestamp. Replaying an identical attempt ID returns its original grade. Grade history is a projection of the immutable attempts.

Migration `0007_assessments_guided_labs` adds `authoring.bank_questions`, owned by the creating author, with localized prompts, aligned choices, explanations, an answer index, tags, an edit version, and an archive timestamp. Import creates a distinct draft question ID and copies the content, source ID and tags. Publication freezes that copy in `authoring.snapshots`. Editing or archiving the source leaves existing draft copies, published revisions, and grades intact.

Each Guided Lab template lives in the course document with a stable ID, `GUIDED` mode, Arabic and English titles and instructions, LTR command text, a starter snippet, ordered localized checkpoints, and an optional evidence prompt. Publishing requires both lab translations and freezes the template with the course revision.

`learning.guided_attempts` keeps one record per enrollment and lab ID. Checkpoints and evidence are editable before completion. Completion freezes that submission and records `SELF_REPORTED`. `learning.guided_reviews` stores one immutable decision per submitted attempt with reviewer ID, feedback, timestamp and `INSTRUCTOR_REVIEWED` provenance. The learner sees the original submission alongside the review. `SYSTEM_VERIFIED` belongs to the separate Real Lab checker boundary.

Phase 6 uses the v0.4.0 schema through migration `0007`. The curated course, lessons, quiz occurrences, source questions, lab templates, and checkpoints use stable IDs. The seed command creates only the first draft and bank entries. Its publication step locks the draft, compares it with the curated document, and writes revision 1, both catalog translations, the snapshot, and the publication event in one transaction. A matching initial publication makes subsequent seed runs a no-op. Staff edits and existing enrollment pins are preserved.

Migration `0008_real_lab_pilot` adds a private `real_lab` schema. The attempt row stores the learner ID, launch session ID, idempotency key, approved template version, expiry, state, and queue lease. The session ID stays on the attempt after the authentication session is revoked so the bridge can finish cleanup. A partial unique index protects the per-learner active-instance cap. PostgreSQL stores hashes of short-lived grants and marks each redeemed grant in a transaction that rechecks attempt and session state.

The bridge appends results under the matching live attempt and validation lease. Each result records the template and checker versions, the observed configuration and response criteria, and the check time. The result constraint permits `SYSTEM_VERIFIED` only when both criteria succeed. Results remain available in the launch session after sandbox teardown. Guided Lab records retain their existing completion provenance constraints.

Migration `0009_content_import_assessments` adds a nullable `last_import_digest` to `authoring.drafts`. The importer derives stable module, lesson, Markdown block, quiz, and question IDs from the course slug and source keys. The database stores a SHA-256 digest of the imported JSON document. Replaying an identical draft leaves its edit version unchanged. A changed source can update a draft whose current document still matches the last import. Staff edits and unrelated slugs cause a conflict. Existing published snapshots, translations, and enrollment pins stay intact.

Lesson snapshots can contain localized `markdown` blocks. Bank records and snapshot questions use `type` to distinguish `find_bug` and `cli_recall`. Records without a type retain their multiple-choice shape. `find_bug` uses one-based line numbers and a private exact set of faulty lines. `cli_recall` has a private `exact`, `flags`, or `regex` rule. Attempt answers remain JSON and can contain an index, an array of line numbers, or a CLI string. The learner read returns prompts and the type-specific display fields. The learner submit returns only the grade.

`bash infra/verify.sh` rehearses the upgrade from v0.6.0 and compares fixture fingerprints before and after applying `0009`. [Migration evidence](PLANS.md#phase-8--lesson-diagrams-assessments-and-course-import)

## Phase 9 concept ontology and mastery

Migration `0010_knowledge_mastery` adds the private `knowledge` schema. A concept has a unique slug, one of six track slugs, bilingual titles and summaries, and a creation timestamp. `concept_edges` links two distinct concepts. Each directed source, target, and relation tuple is unique. The allowed relations are `prerequisite`, `integrates_with`, `monitors`, `secures`, and `deploys_to`.

`lesson_concepts` and `question_concepts` pair a course slug and stable snapshot occurrence ID with a concept. `lab_concepts` pairs a course slug and Guided Lab ID, or the approved Real Lab template version, with a concept. The migration seeds twelve concepts and fifteen edges, maps all fourteen lessons, twelve quiz questions, and four Guided Labs from the curated Prometheus and Grafana path, and maps the NGINX pilot. The seed inserts use conflict-safe stable keys. A lesson, question, or lab contributes only when its ID occurs in the selected published snapshot. The ontology can describe a subject before it has published practice.

The mastery reader uses an owned enrollment’s published revision, or the latest public published revision in the requested locale for enrollment links. The latest immutable attempt per enrollment and quiz supplies quiz evidence. PostgreSQL reuses the existing grader against the pinned question definition and returns per-concept quiz counts. It returns completion flags and provenance without answer keys, submitted answers, lab evidence, or review feedback.

| Signal | Weight | Credit |
| --- | --- | --- |
| Lessons | 25% | Completed linked lessons divided by linked lessons |
| Quizzes | 40% | Correct linked questions from the latest attempt per quiz divided by available linked questions. The breakdown also shows accuracy among attempted questions. |
| Labs | 35% | Average credit across available linked labs. A system-verified Real Lab earns 100%, an instructor-approved Guided Lab 85%, a self-reported Guided Lab 50%, and incomplete or unapproved work 0%. |

The weighted calculator accepts evidence signals with a credit, maximum, and weight. An absent category is omitted from the denominator. Tracks average their concepts with available evidence. The remediation queue sorts actionable concepts by ascending score, descending missed questions, descending incomplete labs, then slug. It prioritizes retrying a failed quiz and completing pending labs when choosing a practice link. Mastery is calculated on read from the existing records. [Upgrade and grading checks](PLANS.md#phase-9--cross-track-knowledge-graph-and-mastery)

## Phase 10 interviews and mastery evidence

Additive migration `0011_mock_interviews` creates `interview.sessions`, `interview.messages`, and `interview.rate_limits` in `academy`. The session belongs to an identity user and stores role, seniority, selected track slugs, interview locale, answer count, reserved token totals, and an optional completed `scorecard_json` with its timestamp. Messages belong to the session and are ordered by position. The learner sees up to 20 history entries per page and loads the transcript when opening an entry.

A 35-second lease serializes changes to an interview. Each accepted answer and its next question commit together. The fourth answer finishes the transcript. Evaluation can follow any recorded answer and freezes the scorecard and transcript. The rate-limit row counts requests per learner across app instances. The session reserves up to 65,536 prompt tokens and 6,144 output tokens across attempts, including failed provider calls. Each generation checks an 8,192-token prompt cap and uses a 768-token question or 1,536-token evaluation output cap.

The latest completed interview covering a concept’s track contributes its overall score when it lists the concept in `weak_concept_slugs`. Mastery treats that as an additional signal with weight 20 alongside the existing weights. Unflagged concepts use their normal learning evidence. Weak concepts enter the remediation queue with linked practice or the concept drawer when no course material is mapped. [Migration and evidence checks](PLANS.md#phase-10--server-side-ai-mock-technical-interviewer)

## Phase 11 identity grants

Migration `0012_identity_definer_hardening` changes ownership and grants for the six existing identity routines. `academy_identity_definer` is a non-login role. The migration preserves the tables and stored records. The user trigger permits the new owner to insert invited roles below Owner while retaining the existing Owner and suspension protections. The sign-in limiter uses the existing `identity.account_rate_limit` table. Sign-in buckets are keyed by an HMAC of the normalized email identifier and deployment secret. [Phase 11 gate evidence](PLANS.md#phase-11--production-readiness-security--release-hardening)

## Phase 12 Real Lab templates and mastery

Migration `0013_multi_track_real_labs` expands the existing template, checker-pair, and Real Lab concept-link constraints. It adds two concept rows, their prerequisite edges, and two template mappings. Existing NGINX attempts, checks, and mappings remain on their original versions. Both lab modes continue to use the single `academy` database.

`real_lab.student(text,text,uuid,text)` takes the approved template version at launch and stores it on `real_lab.attempts`. The existing three-argument signature defaults new launches to NGINX. Replaying a launch ID with its original version returns the attempt. Reusing that ID with a different version conflicts. Grants and jobs return the attempt's stored template. The worker finish function accepts only the paired checker version on a live validation lease. The unchanged provenance constraint requires both observed criteria to succeed before a check can be stored as `SYSTEM_VERIFIED`.

The existing mastery projection reads the new mappings and verified checks for the signed-in learner. Eligible lab items without verified results remain in the remediation queue. A verified result supplies full lab credit after workspace teardown. [Phase 9 scoring](#phase-9-concept-ontology-and-mastery) · [Phase 12 evidence](PLANS.md#phase-12--multi-track-real-labs-expansion)
