BEGIN;

INSERT INTO identity."user"(id, name, email, role) VALUES
  ('phase5-author','Author','phase5-author@example.test','INSTRUCTOR'),
  ('phase5-peer','Peer','phase5-peer@example.test','INSTRUCTOR'),
  ('phase5-student','Learner','phase5-student@example.test','STUDENT'),
  ('phase5-other','Other learner','phase5-other@example.test','STUDENT');
INSERT INTO identity.session(id, user_id, token, expires_at)
SELECT id || '-session', id, id || '-token', now() + interval '1 day'
FROM identity."user" WHERE id IN ('phase5-author','phase5-peer','phase5-student','phase5-other');

INSERT INTO public.courses(id, slug) VALUES ('57000000-0000-4000-8000-000000000001','phase5-fixture');
INSERT INTO public.course_versions(id, course_id, revision, published_at)
VALUES ('57000000-0000-4000-8000-000000000002','57000000-0000-4000-8000-000000000001',1,now());
INSERT INTO public.course_translations(version_id, locale, title, summary)
VALUES ('57000000-0000-4000-8000-000000000002','en','Guided fixture','Course fixture');
INSERT INTO authoring.drafts(course_id, owner_id, document)
VALUES ('57000000-0000-4000-8000-000000000001','phase5-author','{"slug":"phase5-fixture","modules":[],"translations":{},"position":0}');
INSERT INTO authoring.snapshots(version_id, document)
VALUES ('57000000-0000-4000-8000-000000000002', '{
  "translations":{"en":{"title":"Guided fixture"}},"modules":[],
  "quizzes":[{"id":"57000000-0000-4000-8000-000000000007","titles":{"en":"Quiz"},"questions":[
    {"id":"57000000-0000-4000-8000-000000000008","correct":0,"translations":{"en":{"prompt":"Question","choices":["A","B"],"explanation":"Private rationale"}}}
  ]}],
  "guidedLabs":[{"id":"57000000-0000-4000-8000-000000000003","labMode":"GUIDED","titles":{"en":"Lab","ar":"مختبر"},
    "instructions":{"en":"Inspect the file","ar":"افحص الملف"},"commands":"cat config","starter":"enabled=true",
    "checkpoints":[{"id":"57000000-0000-4000-8000-000000000004","labels":{"en":"Inspect","ar":"افحص"}}],"evidencePrompt":{}}]
}');
INSERT INTO learning.enrollments(id, student_id, course_id, version_id) VALUES
  ('57000000-0000-4000-8000-000000000005','phase5-student','57000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000002'),
  ('57000000-0000-4000-8000-000000000006','phase5-other','57000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000002');
INSERT INTO learning.guided_attempts(id, enrollment_id, lab_id)
VALUES ('57000000-0000-4000-8000-000000000009','57000000-0000-4000-8000-000000000005','57000000-0000-4000-8000-000000000003');

DO $roles$
DECLARE
  runtime text;
  private_table text;
  scoped_function regprocedure;
BEGIN
  FOREACH runtime IN ARRAY ARRAY['academy_reader','academy_auth','academy_author','academy_learner'] LOOP
    FOREACH private_table IN ARRAY ARRAY['authoring.bank_questions','authoring.snapshots','learning.guided_attempts','learning.guided_reviews'] LOOP
      IF has_table_privilege(runtime, private_table, 'SELECT,INSERT,UPDATE,DELETE') OR
         has_any_column_privilege(runtime, private_table, 'SELECT,INSERT,UPDATE') THEN
        RAISE EXCEPTION 'Raw private access for % on %', runtime, private_table;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH scoped_function IN ARRAY ARRAY[
    'authoring.bank_command(text,text,uuid,jsonb,integer)'::regprocedure,
    'authoring.guided_review_command(text,public.course_locale,jsonb)'::regprocedure,
    'learning.guided_command(text,text,uuid,public.course_locale,jsonb)'::regprocedure
  ] LOOP
    IF EXISTS (SELECT FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
      WHERE p.oid = scoped_function AND (r.rolsuper OR r.rolcanlogin OR r.rolbypassrls OR NOT p.prosecdef)) THEN
      RAISE EXCEPTION 'Improper function owner for %', scoped_function;
    END IF;
    IF has_function_privilege('academy_reader', scoped_function, 'EXECUTE') OR
       has_function_privilege('academy_auth', scoped_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'Unrelated runtime can call %', scoped_function;
    END IF;
  END LOOP;
  IF has_function_privilege('academy_author', 'learning.guided_command(text,text,uuid,public.course_locale,jsonb)', 'EXECUTE') OR
     has_function_privilege('academy_learner', 'authoring.bank_command(text,text,uuid,jsonb,integer)', 'EXECUTE') OR
     has_function_privilege('academy_learner', 'authoring.guided_review_command(text,public.course_locale,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Author and learner capabilities overlap';
  END IF;
END;
$roles$;

SET LOCAL ROLE academy_author;
DO $bank$
DECLARE
  question jsonb;
BEGIN
  question := authoring.bank_command('phase5-author-token','create',NULL,'{
    "correct":0,"tags":["linux"],"translations":{
      "en":{"prompt":"Private item","choices":["A","B"],"explanation":"The reason"},
      "ar":{"prompt":"سؤال خاص","choices":["أ","ب"],"explanation":"السبب"}}}',NULL);
  IF question->>'id' IS NULL OR jsonb_array_length(authoring.bank_command('phase5-peer-token','list',NULL,NULL,NULL)) <> 0 THEN
    RAISE EXCEPTION 'Bank ownership violation';
  END IF;
  BEGIN
    PERFORM authoring.bank_command('phase5-peer-token','read',(question->>'id')::uuid,NULL,NULL);
    RAISE EXCEPTION 'Peer accessed private question';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM authoring.bank_command('phase5-student-token','list',NULL,NULL,NULL);
    RAISE EXCEPTION 'Student session accessed question bank';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM authoring.course_command('phase5-author-token','save','57000000-0000-4000-8000-000000000001',
      '{"slug":"phase5-fixture","modules":[],"translations":{},"position":0,"guidedLabs":[{"labMode":"SYSTEM_VERIFIED"}]}',1);
    RAISE EXCEPTION 'Authoring accepted a forbidden lab mode';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$bank$;

RESET ROLE;
SET LOCAL ROLE academy_learner;
DO $learner$
DECLARE
  enrollment_id uuid := '57000000-0000-4000-8000-000000000005';
  submission jsonb := '{"labId":"57000000-0000-4000-8000-000000000003","checkpointIds":["57000000-0000-4000-8000-000000000004"],"evidence":"Original output","completionProvenance":"SELF_REPORTED"}';
  provenance text;
  player jsonb;
BEGIN
  player := learning.student_command('phase5-student-token','read',enrollment_id,'en',NULL);
  IF player->'quizzes'->0->'questions'->0 ?| ARRAY['correct','explanation'] OR player::text LIKE '%Private rationale%' THEN
    RAISE EXCEPTION 'Learner response leaked the private quiz key';
  END IF;
  BEGIN
    PERFORM learning.guided_command('phase5-other-token','complete',enrollment_id,'en',submission);
    RAISE EXCEPTION 'Cross-student write succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  FOREACH provenance IN ARRAY ARRAY['INSTRUCTOR_REVIEWED','SYSTEM_VERIFIED'] LOOP
    BEGIN
      PERFORM learning.guided_command('phase5-student-token','complete',enrollment_id,'en',
        submission || jsonb_build_object('completionProvenance',provenance));
      RAISE EXCEPTION 'Learner forged provenance %', provenance;
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
  END LOOP;
  IF learning.guided_command('phase5-student-token','complete',enrollment_id,'en',submission)->>'completionProvenance'
    IS DISTINCT FROM 'SELF_REPORTED' THEN RAISE EXCEPTION 'Self-report did not persist'; END IF;
  IF learning.guided_command('phase5-student-token','read',enrollment_id,'en',NULL)->0->'attempt'->>'evidence'
    IS DISTINCT FROM 'Original output' THEN RAISE EXCEPTION 'Student projection lost the original evidence'; END IF;
  BEGIN
    PERFORM learning.guided_command('phase5-student-token','save',enrollment_id,'en',submission || '{"evidence":"Overwrite"}');
    RAISE EXCEPTION 'Submitted evidence was overwritten';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
END;
$learner$;

RESET ROLE;
SET LOCAL ROLE academy_author;
DO $review$
DECLARE
  decision jsonb := '{"attemptId":"57000000-0000-4000-8000-000000000009","decision":"APPROVED","feedback":"Well done","completionProvenance":"INSTRUCTOR_REVIEWED"}';
  review jsonb;
BEGIN
  BEGIN
    PERFORM authoring.guided_review_command('phase5-peer-token','en',decision);
    RAISE EXCEPTION 'Cross-instructor review succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM authoring.guided_review_command('phase5-student-token','en',decision);
    RAISE EXCEPTION 'Student reviewed an attempt';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM authoring.guided_review_command('phase5-author-token','en',decision || '{"completionProvenance":"SYSTEM_VERIFIED"}');
    RAISE EXCEPTION 'Author forged system verification';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  review := authoring.guided_review_command('phase5-author-token','en',decision);
  IF review->>'evidence' IS DISTINCT FROM 'Original output' OR
     review->'review'->>'completionProvenance' IS DISTINCT FROM 'INSTRUCTOR_REVIEWED' THEN
    RAISE EXCEPTION 'Review replaced original submission or recorded the wrong provenance';
  END IF;
  IF authoring.guided_review_command('phase5-author-token','en',jsonb_build_object('attemptId',decision->>'attemptId'))->>'courseOwnerId'
    IS DISTINCT FROM 'phase5-author' THEN RAISE EXCEPTION 'Review scope lost the course owner'; END IF;
  IF authoring.guided_review_command('phase5-author-token','en',NULL)->0->'attempt'->'review'->>'decision'
    IS DISTINCT FROM 'APPROVED' OR authoring.guided_review_command('phase5-peer-token','en',NULL) <> '[]'::jsonb THEN
    RAISE EXCEPTION 'Review queue lost the decision or exceeded instructor scope';
  END IF;
  BEGIN
    PERFORM authoring.guided_review_command('phase5-author-token','en',decision || '{"feedback":"Overwrite"}');
    RAISE EXCEPTION 'Review was overwritten';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
END;
$review$;

RESET ROLE;
DO $constraints$
BEGIN
  BEGIN
    UPDATE learning.guided_attempts SET completion_provenance = 'SYSTEM_VERIFIED'
    WHERE id = '57000000-0000-4000-8000-000000000009';
    RAISE EXCEPTION 'System provenance escaped attempt constraint';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE learning.guided_reviews SET completion_provenance = 'SELF_REPORTED'
    WHERE attempt_id = '57000000-0000-4000-8000-000000000009';
    RAISE EXCEPTION 'Learner provenance escaped review constraint';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$constraints$;

ROLLBACK;
