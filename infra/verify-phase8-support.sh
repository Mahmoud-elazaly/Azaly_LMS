#!/usr/bin/env bash

phase8_legacy_digest() {
  phase7_sql <<'SQL'
SELECT md5(jsonb_build_array(
  (SELECT to_jsonb(u) FROM identity."user" u WHERE id='phase8-upgrade'),
  (SELECT to_jsonb(a) FROM identity.account a WHERE id='phase8-upgrade'),
  (SELECT to_jsonb(s) FROM identity.session s WHERE id='phase8-upgrade'),
  (SELECT to_jsonb(i) FROM identity.invitation i WHERE id='phase8-upgrade'),
  (SELECT to_jsonb(c) FROM public.courses c WHERE id='aaa80000-0000-4000-8000-000000000001'),
  (SELECT to_jsonb(d) - 'last_import_digest' FROM authoring.drafts d WHERE course_id='aaa80000-0000-4000-8000-000000000001'),
  (SELECT to_jsonb(s) FROM authoring.snapshots s WHERE version_id='aaa80000-0000-4000-8000-000000000002'),
  (SELECT to_jsonb(a) FROM learning.attempts a WHERE id='aaa80000-0000-4000-8000-000000000003'),
  (SELECT to_jsonb(a) FROM learning.guided_attempts a WHERE id='aaa80000-0000-4000-8000-000000000004'),
  (SELECT to_jsonb(r) FROM learning.guided_reviews r WHERE attempt_id='aaa80000-0000-4000-8000-000000000004'),
  (SELECT to_jsonb(a) FROM real_lab.attempts a WHERE id='aaa80000-0000-4000-8000-000000000005'),
  (SELECT to_jsonb(r) FROM real_lab.checks r WHERE attempt_id='aaa80000-0000-4000-8000-000000000005')
)::text);
SQL
}

phase8_upgrade() {
  test "$(phase7_sql -c 'SELECT count(*) FROM drizzle.__drizzle_migrations')" = 9
  phase7_sql <<'SQL'
INSERT INTO identity."user" (id,name,email)
  VALUES ('phase8-upgrade','Upgrade learner','phase8-upgrade@sql.example.test');
INSERT INTO identity.account (id,account_id,provider_id,user_id,password)
  VALUES ('phase8-upgrade','phase8-upgrade','credential','phase8-upgrade','synthetic-credential-hash');
INSERT INTO identity.session (id,token,user_id,expires_at)
  VALUES ('phase8-upgrade','phase8-upgrade-token','phase8-upgrade',now()+interval '1 day');
INSERT INTO identity.invitation (id,name,email,role,locale,token_hash,expires_at,created_by)
  VALUES ('phase8-upgrade','Invitee','phase8-invite@sql.example.test','STUDENT','ar',
    repeat('8',64),now()+interval '1 day','phase8-upgrade');
INSERT INTO public.courses (id,slug) VALUES ('aaa80000-0000-4000-8000-000000000001','phase8-existing');
INSERT INTO public.course_versions (id,course_id,revision,published_at)
  VALUES ('aaa80000-0000-4000-8000-000000000002','aaa80000-0000-4000-8000-000000000001',1,now());
INSERT INTO authoring.drafts (course_id,owner_id,document)
  VALUES ('aaa80000-0000-4000-8000-000000000001','phase8-upgrade','{"slug":"phase8-existing"}');
INSERT INTO authoring.snapshots (version_id,document)
  VALUES ('aaa80000-0000-4000-8000-000000000002','{"slug":"phase8-existing"}');
INSERT INTO learning.enrollments (id,student_id,course_id,version_id)
  VALUES ('aaa80000-0000-4000-8000-000000000006','phase8-upgrade',
    'aaa80000-0000-4000-8000-000000000001','aaa80000-0000-4000-8000-000000000002');
INSERT INTO learning.attempts (id,enrollment_id,quiz_id,answers,score,total)
  VALUES ('aaa80000-0000-4000-8000-000000000003','aaa80000-0000-4000-8000-000000000006',gen_random_uuid(),'{"answer":0}',1,1);
INSERT INTO learning.guided_attempts (id,enrollment_id,lab_id,evidence,completion_provenance,submitted_at)
  VALUES ('aaa80000-0000-4000-8000-000000000004','aaa80000-0000-4000-8000-000000000006',
    gen_random_uuid(),'Existing evidence','SELF_REPORTED',now());
INSERT INTO learning.guided_reviews (attempt_id,reviewer_id,decision)
  VALUES ('aaa80000-0000-4000-8000-000000000004','phase8-upgrade','APPROVED');
INSERT INTO real_lab.attempts (id,learner_id,session_id,request_id,state,expires_at,destroyed_at)
  VALUES ('aaa80000-0000-4000-8000-000000000005','phase8-upgrade','phase8-upgrade',gen_random_uuid(),'DESTROYED',now(),now());
INSERT INTO real_lab.checks (id,attempt_id,template_version,checker_version,configuration_ok,response_ok,completion_provenance)
  VALUES (gen_random_uuid(),'aaa80000-0000-4000-8000-000000000005','nginx-reverse-proxy@1','nginx-route@1',
    true,true,'SYSTEM_VERIFIED');
SQL
  local before
  before="$(phase8_legacy_digest)"
  dc run --rm migrate
  test "$(phase7_sql -c 'SELECT count(*) FROM drizzle.__drizzle_migrations')" = 10
  test "$before" = "$(phase8_legacy_digest)"
  phase7_sql <<'SQL'
DELETE FROM real_lab.checks WHERE attempt_id='aaa80000-0000-4000-8000-000000000005';
DELETE FROM real_lab.attempts WHERE id='aaa80000-0000-4000-8000-000000000005';
DELETE FROM learning.guided_reviews WHERE attempt_id='aaa80000-0000-4000-8000-000000000004';
DELETE FROM learning.guided_attempts WHERE id='aaa80000-0000-4000-8000-000000000004';
DELETE FROM learning.attempts WHERE id='aaa80000-0000-4000-8000-000000000003';
DELETE FROM learning.enrollments WHERE id='aaa80000-0000-4000-8000-000000000006';
DELETE FROM authoring.snapshots WHERE version_id='aaa80000-0000-4000-8000-000000000002';
DELETE FROM authoring.drafts WHERE course_id='aaa80000-0000-4000-8000-000000000001';
DELETE FROM public.course_versions WHERE id='aaa80000-0000-4000-8000-000000000002';
DELETE FROM public.courses WHERE id='aaa80000-0000-4000-8000-000000000001';
DELETE FROM identity.invitation WHERE id='phase8-upgrade';
DELETE FROM identity."user" WHERE id='phase8-upgrade';
SQL
  echo 'Phase 8 upgraded the v0.6.0 fixtures and preserved credentials, sessions, invitations, courses, grades and both lab models.'
}
