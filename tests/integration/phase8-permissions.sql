BEGIN;
INSERT INTO identity."user" (id,name,email,role) VALUES
  ('p8-author','Author','p8-author@example.test','INSTRUCTOR'),
  ('p8-outsider','Other instructor','p8-outsider@example.test','INSTRUCTOR'),
  ('p8-student','Student','p8-student@example.test','STUDENT'),
  ('p8-other-student','Other student','p8-other-student@example.test','STUDENT');
INSERT INTO identity.session (id,token,user_id,expires_at)
  SELECT id,id||'-token',id,now()+interval '1 day' FROM identity."user" WHERE id LIKE 'p8-%';

DO $grants$
BEGIN
  IF EXISTS (
    SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid IN ('authoring.import_draft(text,jsonb)'::regprocedure,
      'learning.assessment_answer(jsonb,jsonb,public.course_locale)'::regprocedure) AND a.grantee=0
  ) OR NOT EXISTS (
    SELECT FROM pg_proc p JOIN pg_roles r ON p.proowner=r.oid
    WHERE p.oid='authoring.import_draft(text,jsonb)'::regprocedure AND p.prosecdef
      AND r.rolname='academy_authoring_definer' AND NOT r.rolcanlogin AND NOT r.rolsuper
  ) OR has_function_privilege('academy_learner_runtime','authoring.import_draft(text,jsonb)','EXECUTE')
    OR has_function_privilege('academy_learner_runtime','learning.assessment_answer(jsonb,jsonb,public.course_locale)','EXECUTE')
    OR has_function_privilege('academy_reader','authoring.import_draft(text,jsonb)','EXECUTE')
    OR has_table_privilege('academy_learner_runtime','authoring.snapshots','SELECT')
    OR has_table_privilege('academy_authoring_runtime','authoring.drafts','UPDATE')
  THEN RAISE EXCEPTION 'Phase 8 role boundary is open'; END IF;
END;
$grants$;

SET ROLE academy_authoring_runtime;
DO $author$
DECLARE
  doc jsonb := '{
    "slug":"p8-course","position":0,"translations":{"en":{"title":"Skills","summary":"Practice"}},
    "modules":[{"id":"de800000-0000-4000-8000-000000000001","titles":{"en":"Module"},"lessons":[
      {"id":"de800000-0000-4000-8000-000000000002","titles":{"en":"Lesson"},"blocks":[
        {"id":"de800000-0000-4000-8000-000000000003","type":"markdown","translations":{"en":"Read the original."}}
      ]}
    ]}],
    "quizzes":[{"id":"de800000-0000-4000-8000-000000000010","titles":{"en":"Test"},"questions":[
      {"id":"de800000-0000-4000-8000-000000000011","type":"find_bug","language":"yaml","snippet":"one\ntwo\nthree",
        "faultyLines":[1,2],"translations":{"en":{"prompt":"Lines?","explanation":"PRIVATE BUG RUBRIC"}}},
      {"id":"de800000-0000-4000-8000-000000000012","type":"cli_recall","rule":{"mode":"flags","value":"compose check --target=demo --fast"},
        "translations":{"en":{"prompt":"Flags?"}}},
      {"id":"de800000-0000-4000-8000-000000000013","type":"cli_recall","rule":{"mode":"regex","value":"kubectl get (pods|po)"},
        "translations":{"en":{"prompt":"Regex?"}}},
      {"id":"de800000-0000-4000-8000-000000000014","type":"cli_recall","rule":{"mode":"exact","value":"printf \"a  b\""},
        "translations":{"en":{"prompt":"Exact?"}}}
    ]}]
  }';
  result jsonb;
  course_key uuid;
BEGIN
  result := authoring.import_draft('p8-author-token', doc);
  course_key := (result->>'id')::uuid;
  IF result->>'status' <> 'created' OR (authoring.import_draft('p8-author-token', doc)->>'status') <> 'unchanged'
    THEN RAISE EXCEPTION 'Import did not replay idempotently'; END IF;
  BEGIN
    PERFORM authoring.import_draft('p8-outsider-token', doc);
    RAISE EXCEPTION 'Scope allowed another instructor';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM authoring.import_draft('p8-student-token', doc);
    RAISE EXCEPTION 'Scope allowed a Student';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM authoring.import_draft('p8-author-token', jsonb_set(doc, '{quizzes,0,questions,0,faultyLines}', '[4]'));
    RAISE EXCEPTION 'Out-of-range key passed database checks';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM authoring.course_command('p8-author-token','publish',course_key,NULL,(result->>'version')::integer);
  result := authoring.import_draft('p8-author-token', jsonb_set(doc, '{modules,0,lessons,0,blocks,0,translations,en}', '"Draft-only edit"'));
  IF result->>'status' <> 'updated' THEN RAISE EXCEPTION 'Updated source did not update draft'; END IF;
  PERFORM authoring.course_command('p8-author-token','save',course_key,
    jsonb_set(doc, '{modules,0,lessons,0,blocks,0,translations,en}', '"Manual edit"'),(result->>'version')::integer);
  BEGIN
    PERFORM authoring.import_draft('p8-author-token', doc);
    RAISE EXCEPTION 'Importer overwrote manual edit';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
END;
$author$;
RESET ROLE;

SET ROLE academy_learner_runtime;
DO $learner$
DECLARE
  enrollment uuid;
  result jsonb;
  inputs jsonb := '{
    "de800000-0000-4000-8000-000000000011":[2,1],
    "de800000-0000-4000-8000-000000000012":"  compose\tcheck --fast  --target=demo ",
    "de800000-0000-4000-8000-000000000013":"kubectl   get po",
    "de800000-0000-4000-8000-000000000014":"printf\t\"a  b\""
  }';
  submission jsonb := '{"quizId":"de800000-0000-4000-8000-000000000010"}';
BEGIN
  enrollment := (learning.student_command('p8-student-token','enroll',NULL,'en','{"slug":"p8-course"}')->>'id')::uuid;
  result := learning.student_command('p8-student-token','read',enrollment,'en',NULL);
  IF result::text ~ 'PRIVATE BUG RUBRIC|faultyLines|target=demo|kubectl get|rule|Draft-only edit'
    OR result #>> '{content,modules,0,lessons,0,blocks,0,text}' <> 'Read the original.'
    OR result #>> '{quizzes,0,questions,0,type}' <> 'find_bug'
    OR result #>> '{quizzes,0,questions,1,type}' <> 'cli_recall'
    THEN RAISE EXCEPTION 'Learner projection is incorrect'; END IF;
  BEGIN
    PERFORM learning.student_command('p8-other-student-token','submit',enrollment,'en',
      submission || jsonb_build_object('attemptId', gen_random_uuid(), 'answers', inputs));
    RAISE EXCEPTION 'Another learner submitted to enrollment';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  result := learning.student_command('p8-student-token','submit',enrollment,'en',
    submission || jsonb_build_object('attemptId', gen_random_uuid(), 'answers', inputs));
  IF (result->>'score')::integer <> 4 OR (result->>'total')::integer <> 4
    THEN RAISE EXCEPTION 'Valid answers did not pass'; END IF;
  result := learning.student_command('p8-student-token','submit',enrollment,'en',
    submission || jsonb_build_object('attemptId', gen_random_uuid(), 'answers', inputs || '{
      "de800000-0000-4000-8000-000000000011":[2],
      "de800000-0000-4000-8000-000000000012":"check compose --target=demo --fast",
      "de800000-0000-4000-8000-000000000013":"kubectl get pods --watch",
      "de800000-0000-4000-8000-000000000014":"printf \"a b\""
    }'::jsonb));
  IF (result->>'score')::integer <> 0 THEN RAISE EXCEPTION 'Inexact answers passed'; END IF;
  BEGIN
    PERFORM learning.student_command('p8-student-token','submit',enrollment,'en',
      submission || jsonb_build_object('attemptId', gen_random_uuid(),
        'answers', inputs || '{"de800000-0000-4000-8000-000000000011":[2,2]}'::jsonb));
    RAISE EXCEPTION 'A duplicate line was treated as a valid answer';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END;
$learner$;
RESET ROLE;
ROLLBACK;
