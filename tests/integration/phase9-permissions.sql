BEGIN;

DO $grants$
DECLARE
  entry regprocedure := 'knowledge.learner_evidence(text,public.course_locale)'::regprocedure;
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_proc p JOIN pg_roles r ON p.proowner = r.oid
    WHERE p.oid = entry AND p.prosecdef AND 'search_path=pg_catalog' = ANY (p.proconfig)
      AND r.rolname = 'academy_mastery_definer' AND NOT r.rolcanlogin AND NOT r.rolsuper
  ) OR EXISTS (
    SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid = entry AND a.grantee = 0
  ) OR NOT has_function_privilege('academy_learner_runtime', entry, 'EXECUTE') OR EXISTS (
    SELECT FROM unnest(ARRAY['academy_reader', 'academy_auth_runtime', 'academy_authoring_runtime', 'academy_real_lab_runtime']) r
    WHERE has_function_privilege(r::name, entry, 'EXECUTE') OR has_schema_privilege(r::name, 'knowledge', 'USAGE')
  ) OR EXISTS (
    SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'knowledge' AND c.relkind = 'r'
      AND (has_table_privilege('academy_learner_runtime', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
        OR has_table_privilege('academy_mastery_definer', c.oid, 'INSERT, UPDATE, DELETE'))
  ) OR pg_has_role('academy_learner_runtime', 'academy_mastery_definer', 'MEMBER')
    OR has_column_privilege('academy_mastery_definer', 'learning.guided_attempts', 'evidence', 'SELECT')
    OR has_any_column_privilege('academy_mastery_definer', 'authoring.drafts', 'SELECT')
    OR has_any_column_privilege('academy_mastery_definer', 'identity.account', 'SELECT')
    OR has_any_column_privilege('academy_learner_runtime', 'real_lab.checks', 'SELECT')
    OR has_function_privilege('academy_learner_runtime', 'learning.assessment_answer(jsonb,jsonb,public.course_locale)', 'EXECUTE')
  THEN RAISE EXCEPTION 'Mastery grants are wider than the intended read path'; END IF;
END;
$grants$;

DO $ontology$
DECLARE
  linux uuid := (SELECT id FROM knowledge.concepts WHERE slug = 'linux-networking');
  nginx uuid := (SELECT id FROM knowledge.concepts WHERE slug = 'nginx-reverse-proxy');
BEGIN
  IF (SELECT count(*) FROM knowledge.concepts) <> 12
    OR (SELECT count(*) FROM knowledge.concept_edges) <> 15
    OR (SELECT count(*) FROM knowledge.lesson_concepts WHERE course_slug = 'prometheus-grafana') <> 14
    OR (SELECT count(*) FROM knowledge.question_concepts WHERE course_slug = 'prometheus-grafana') <> 12
    OR (SELECT count(*) FROM knowledge.lab_concepts) <> 5
  THEN RAISE EXCEPTION 'The curated ontology is incomplete'; END IF;
  BEGIN
    INSERT INTO knowledge.concept_edges (source_concept_id,target_concept_id,relation_type) VALUES (linux,linux,'monitors');
    RAISE EXCEPTION 'Self edge accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO knowledge.concept_edges (source_concept_id,target_concept_id,relation_type) VALUES (linux,nginx,'prerequisite');
    RAISE EXCEPTION 'Duplicate edge accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO knowledge.concept_edges (source_concept_id,target_concept_id,relation_type) VALUES (linux,gen_random_uuid(),'secures');
    RAISE EXCEPTION 'Edge with unknown concept accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO knowledge.concept_edges (source_concept_id,target_concept_id,relation_type) VALUES (linux,nginx,'unknown');
    RAISE EXCEPTION 'Unknown relationship accepted';
  EXCEPTION WHEN invalid_text_representation THEN NULL; END;
END;
$ontology$;

INSERT INTO identity."user" (id,name,email,role,banned) VALUES
  ('p9-alice','Learner','p9-alice@example.test','STUDENT',false),
  ('p9-bob','Learner','p9-bob@example.test','STUDENT',false),
  ('p9-guest','Learner','p9-guest@example.test','STUDENT',false),
  ('p9-instructor','Instructor','p9-instructor@example.test','INSTRUCTOR',false),
  ('p9-banned','Learner','p9-banned@example.test','STUDENT',true);
INSERT INTO identity.session (id,token,user_id,expires_at)
  SELECT id,id||'-token',id,now()+interval '1 day' FROM identity."user" WHERE id LIKE 'p9-%';
INSERT INTO identity.session (id,token,user_id,expires_at,impersonated_by) VALUES
  ('p9-impersonated','p9-impersonated-token','p9-alice',now()+interval '1 day','p9-instructor'),
  ('p9-expired','p9-expired-token','p9-alice',now()-interval '1 minute',NULL);
INSERT INTO public.courses (id,slug) VALUES ('aa900000-0000-4000-8000-000000000001','p9-evidence');
INSERT INTO public.course_versions (id,course_id,revision,published_at) VALUES
  ('aa900000-0000-4000-8000-000000000002','aa900000-0000-4000-8000-000000000001',1,now()),
  ('aa900000-0000-4000-8000-000000000003','aa900000-0000-4000-8000-000000000001',2,NULL);
INSERT INTO public.course_translations (version_id,locale,title,summary) VALUES
  ('aa900000-0000-4000-8000-000000000002','en','Published practice','Practice'),
  ('aa900000-0000-4000-8000-000000000002','ar','التدريب المنشور','تدريب'),
  ('aa900000-0000-4000-8000-000000000003','en','PRIVATE DRAFT TITLE','Draft');
INSERT INTO authoring.snapshots (version_id,document) VALUES
  ('aa900000-0000-4000-8000-000000000002', '{
    "modules":[{"lessons":[{"id":"aa900000-0000-4000-8000-000000000004","titles":{"en":"Read requests","ar":"قراءة الطلبات"}}]}],
    "quizzes":[{"id":"aa900000-0000-4000-8000-000000000005","titles":{"en":"Mixed practice","ar":"تدريب متنوع"},"questions":[
      {"id":"aa900000-0000-4000-8000-000000000006","correct":1,"translations":{"en":{"choices":["No","Yes"]},"ar":{"choices":["لا","نعم"]}}},
      {"id":"aa900000-0000-4000-8000-000000000007","type":"find_bug","language":"yaml","snippet":"one\ntwo",
        "faultyLines":[2],"translations":{"en":{"prompt":"Which line?","explanation":"PRIVATE RUBRIC"},"ar":{"prompt":"أي سطر؟"}}},
      {"id":"aa900000-0000-4000-8000-000000000008","type":"cli_recall","rule":{"mode":"flags","value":"compose check --target=demo --fast"},
        "translations":{"en":{"prompt":"Which command?"},"ar":{"prompt":"أي أمر؟"}}}
    ]}],
    "guidedLabs":[{"id":"aa900000-0000-4000-8000-000000000009","labMode":"GUIDED","titles":{"en":"Practice lab","ar":"مختبر تدريبي"},
      "instructions":{"en":"Complete the check.","ar":"أكمل التحقّق."},"commands":"","starter":"","evidencePrompt":{},
      "checkpoints":[{"id":"aa900000-0000-4000-8000-000000000010","labels":{"en":"Check","ar":"تحقّق"}}]}]
  }'), ('aa900000-0000-4000-8000-000000000003','{"modules":[{"lessons":[{"id":"aa900000-0000-4000-8000-000000000004","titles":{"en":"PRIVATE DRAFT LESSON"}}]}]}');
INSERT INTO knowledge.lesson_concepts (course_slug,lesson_id,concept_id)
  SELECT 'p9-evidence','aa900000-0000-4000-8000-000000000004',id FROM knowledge.concepts WHERE slug='prometheus';
INSERT INTO knowledge.question_concepts (course_slug,question_id,concept_id)
  SELECT 'p9-evidence',mapping.id::uuid,c.id FROM (VALUES
    ('aa900000-0000-4000-8000-000000000006','prometheus'),
    ('aa900000-0000-4000-8000-000000000007','promql'),
    ('aa900000-0000-4000-8000-000000000008','prometheus')
  ) mapping(id,slug) JOIN knowledge.concepts c ON c.slug=mapping.slug;
INSERT INTO knowledge.lab_concepts (course_slug,lab_id,concept_id)
  SELECT 'p9-evidence','aa900000-0000-4000-8000-000000000009',id FROM knowledge.concepts WHERE slug='prometheus';

SET ROLE academy_learner_runtime;
DO $learner_writes$
DECLARE
  alice uuid := (learning.student_command('p9-alice-token','enroll',NULL,'en','{"slug":"p9-evidence"}')->>'id')::uuid;
  quiz text := 'aa900000-0000-4000-8000-000000000005';
  answers jsonb := '{"aa900000-0000-4000-8000-000000000006":1,"aa900000-0000-4000-8000-000000000007":[2],
    "aa900000-0000-4000-8000-000000000008":"  compose check --fast   --target=demo "}';
BEGIN
  PERFORM learning.student_command('p9-bob-token','enroll',NULL,'en','{"slug":"p9-evidence"}');
  PERFORM learning.student_command('p9-alice-token','complete',alice,'en','{"lessonId":"aa900000-0000-4000-8000-000000000004"}');
  IF (learning.student_command('p9-alice-token','submit',alice,'en',
      jsonb_build_object('attemptId',gen_random_uuid(),'quizId',quiz,'answers',answers))->>'score') <> '3'
  THEN RAISE EXCEPTION 'Mixed quiz fixture was not fully correct'; END IF;
END;
$learner_writes$;
RESET ROLE;
-- Make the latest submission deterministically later without relying on the clock resolution.
UPDATE learning.attempts a SET graded_at = now() - interval '1 minute'
FROM learning.enrollments e WHERE e.id = a.enrollment_id AND e.student_id = 'p9-alice';
SET ROLE academy_learner_runtime;
SELECT learning.student_command('p9-alice-token','submit',e.enrollment_id,'en', jsonb_build_object(
  'attemptId',gen_random_uuid(),'quizId','aa900000-0000-4000-8000-000000000005','answers',
  '{"aa900000-0000-4000-8000-000000000006":0,"aa900000-0000-4000-8000-000000000007":[2],
    "aa900000-0000-4000-8000-000000000008":"compose check --fast --target=demo"}'::jsonb))
FROM (SELECT (learning.student_command('p9-alice-token','enroll',NULL,'en','{"slug":"p9-evidence"}')->>'id')::uuid AS enrollment_id) e;
RESET ROLE;
INSERT INTO learning.guided_attempts (id,enrollment_id,lab_id,evidence,completion_provenance,submitted_at)
  SELECT 'aa900000-0000-4000-8000-000000000011',id,'aa900000-0000-4000-8000-000000000009','PRIVATE EVIDENCE','SELF_REPORTED',now()
  FROM learning.enrollments WHERE student_id='p9-alice';
INSERT INTO learning.guided_reviews (attempt_id,reviewer_id,decision,feedback)
  VALUES ('aa900000-0000-4000-8000-000000000011','p9-instructor','APPROVED','PRIVATE FEEDBACK');
INSERT INTO real_lab.attempts (id,learner_id,session_id,request_id,state,expires_at,destroyed_at)
  VALUES ('aa900000-0000-4000-8000-000000000012','p9-alice','p9-alice',gen_random_uuid(),'DESTROYED',now(),now());
INSERT INTO real_lab.checks (id,attempt_id,template_version,checker_version,configuration_ok,response_ok,completion_provenance)
  VALUES (gen_random_uuid(),'aa900000-0000-4000-8000-000000000012','nginx-reverse-proxy@1','nginx-route@1',true,true,'SYSTEM_VERIFIED');
UPDATE public.courses SET withdrawn_at=now() WHERE slug='p9-evidence';

SET ROLE academy_learner_runtime;
DO $evidence$
DECLARE
  alice jsonb := knowledge.learner_evidence('p9-alice-token','ar');
  bob jsonb := knowledge.learner_evidence('p9-bob-token','ar');
  unenrolled jsonb := knowledge.learner_evidence('p9-guest-token','en');
  token text;
BEGIN
  IF alice::text ~ 'PRIVATE|faultyLines|target=demo|answers|p9-alice' OR bob::text ~ 'PRIVATE|INSTRUCTOR_REVIEWED|SYSTEM_VERIFIED'
    OR unenrolled::text ~ 'p9-evidence|PRIVATE|Published practice' OR NOT alice @> '{"concepts":[
      {"slug":"prometheus","items":[{"kind":"lesson","title":"قراءة الطلبات","completed":true},
        {"kind":"quiz","total":2,"correctCount":1,"attempted":true},
        {"kind":"guided","provenance":"INSTRUCTOR_REVIEWED","review":"APPROVED"}]},
      {"slug":"promql","items":[{"kind":"quiz","total":1,"correctCount":1,"attempted":true}]},
      {"slug":"nginx-reverse-proxy","items":[{"kind":"real","provenance":"SYSTEM_VERIFIED"}]}] }'::jsonb
    OR NOT bob @> '{"concepts":[{"slug":"prometheus","items":[{"kind":"lesson","completed":false},
      {"kind":"quiz","attempted":false,"correctCount":0},{"kind":"guided","provenance":null}]}]}'::jsonb
    OR EXISTS (
      SELECT FROM jsonb_array_elements(alice->'concepts') a CROSS JOIN LATERAL jsonb_array_elements(a->'items') ai
      JOIN LATERAL (SELECT bi FROM jsonb_array_elements(bob->'concepts') b CROSS JOIN LATERAL jsonb_array_elements(b->'items') bi
        WHERE bi->>'enrollmentId' = ai->>'enrollmentId') shared_enrollment ON true
    )
  THEN RAISE EXCEPTION 'Mastery scope, graded response or projection is incorrect'; END IF;
  FOREACH token IN ARRAY ARRAY['unknown','p9-instructor-token','p9-banned-token','p9-impersonated-token','p9-expired-token'] LOOP
    BEGIN
      PERFORM knowledge.learner_evidence(token,'en');
      RAISE EXCEPTION 'Invalid session read mastery';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
END;
$evidence$;
RESET ROLE;
ROLLBACK;
