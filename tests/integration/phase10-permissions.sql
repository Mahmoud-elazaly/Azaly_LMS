\set ON_ERROR_STOP on
BEGIN;
INSERT INTO identity."user" (id, name, email, role) VALUES
  ('phase10-alice', 'Interview Alice', 'phase10-a@sql.example.test','STUDENT'),
  ('phase10-bob', 'Interview Bob', 'phase10-b@sql.example.test','STUDENT'),
  ('phase10-staff', 'Interview staff', 'phase10-s@sql.example.test','INSTRUCTOR');
INSERT INTO identity.session (id, token, user_id, expires_at) VALUES
  ('phase10-alice','phase10-token-a','phase10-alice',now()+interval '1 hour'),
  ('phase10-bob','phase10-token-b','phase10-bob',now()+interval '1 hour'),
  ('phase10-staff','phase10-token-s','phase10-staff',now()+interval '1 hour'),
  ('phase10-expired','phase10-token-expired','phase10-alice',now()-interval '1 hour');

INSERT INTO public.courses (id,slug) VALUES ('aaa10000-0000-4000-8000-000000000001','interview-rbac-course');
INSERT INTO public.course_versions (id,course_id,revision,published_at) VALUES
  ('aaa10000-0000-4000-8000-000000000002','aaa10000-0000-4000-8000-000000000001',1,now()),
  ('aaa10000-0000-4000-8000-000000000003','aaa10000-0000-4000-8000-000000000001',2,NULL);
INSERT INTO public.course_translations (version_id,locale,title,summary)
VALUES ('aaa10000-0000-4000-8000-000000000002','en','Observable service','Published curriculum');
INSERT INTO authoring.drafts (course_id, owner_id, document)
VALUES ('aaa10000-0000-4000-8000-000000000001','phase10-staff','{"text":"PRIVATE-DRAFT"}');
INSERT INTO authoring.snapshots (version_id,document) VALUES
  ('aaa10000-0000-4000-8000-000000000002','{"modules":[{"lessons":[{"id":"aaa10000-0000-4000-8000-000000000004","blocks":[{"type":"paragraph","translations":{"en":"APPROVED-EXTRACT","ar":"ARABIC-EXTRACT"}}]}]}],"quizzes":[{"private":"PRIVATE-ANSWER"}]}'),
  ('aaa10000-0000-4000-8000-000000000003','{"modules":[{"lessons":[{"id":"aaa10000-0000-4000-8000-000000000004","blocks":[{"type":"paragraph","translations":{"en":"PRIVATE-UNPUBLISHED"}}]}]}]}');
INSERT INTO knowledge.lesson_concepts (course_slug,lesson_id,concept_id)
SELECT 'interview-rbac-course','aaa10000-0000-4000-8000-000000000004',id FROM knowledge.concepts WHERE slug='prometheus';

DO $acl$
DECLARE
  runtime text;
  relation text;
  routine text;
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='academy_interview_definer' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
    OR has_table_privilege('academy_interview_definer','authoring.drafts','SELECT') THEN
    RAISE EXCEPTION 'Interview routine owner privileges are unsafe';
  END IF;
  FOREACH runtime IN ARRAY ARRAY['academy_reader','academy_learner_runtime','academy_authoring_runtime','academy_auth_runtime',
    'academy_mastery_definer', 'academy_real_lab_runtime'] LOOP
    FOREACH relation IN ARRAY ARRAY['interview.sessions','interview.messages','interview.rate_limits'] LOOP
      IF has_table_privilege(runtime, relation, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'Unexpected direct interview relation privileges for % on %', runtime, relation;
      END IF;
    END LOOP;
    FOREACH routine IN ARRAY ARRAY['interview.student_command(text,text,uuid,jsonb)','interview.mastery_evidence(text)'] LOOP
      IF has_function_privilege(runtime, routine, 'EXECUTE') <> (runtime = 'academy_learner_runtime') THEN
        RAISE EXCEPTION 'Incorrect interview function grant for %', runtime;
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    WHERE n.nspname='interview' AND (acl.grantee=0 OR p.proowner <> 'academy_interview_definer'::regrole
      OR (p.proname IN ('student_command','mastery_evidence') AND NOT p.prosecdef))) THEN
    RAISE EXCEPTION 'Interview functions must have private grants and use the scoped owner';
  END IF;
END;
$acl$;

SET LOCAL ROLE academy_learner_runtime;
DO $journey$
DECLARE
  setup jsonb := '{"action":"start","role":"sre","seniority":"mid","tracks":["observability","iac"],"locale":"en"}';
  start_lease jsonb;
  reserved jsonb;
  details jsonb;
  sid uuid;
  op text;
  token text;
  i integer;
  score jsonb := '{"overall_score":45,"technical_accuracy":60,"production_and_security_awareness":35,
    "missing_edge_cases":["Missing series"],"model_answer":"Inspect the scrape target.","weak_concept_slugs":["prometheus"]}';
BEGIN
  FOREACH token IN ARRAY ARRAY['phase10-token-s','phase10-token-expired','bogus-token'] LOOP
    BEGIN
      PERFORM interview.student_command(token,'history',NULL,NULL);
      RAISE EXCEPTION 'Unauthorized session accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM interview.mastery_evidence(token);
      RAISE EXCEPTION 'Unauthorized mastery evidence accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;

  start_lease := interview.student_command('phase10-token-a','begin',NULL,setup);
  sid := (start_lease->'session'->>'id')::uuid;
  IF start_lease->'sources' IS NULL OR (start_lease->'sources')::text NOT LIKE '%APPROVED-EXTRACT%'
    OR (start_lease->'sources')::text LIKE '%PRIVATE-%' OR (start_lease->'sources')::text LIKE '%ARABIC-EXTRACT%'
    OR (start_lease->'sources')::text LIKE '%linux-networking%' THEN
    RAISE EXCEPTION 'Grounding projected the wrong content: %', start_lease->'sources';
  END IF;

  FOREACH op IN ARRAY ARRAY['read','history','begin','finish','release'] LOOP
    BEGIN
      PERFORM interview.student_command('phase10-token-b',op,sid,
        jsonb_build_object('action','message','turn',0,'lease',start_lease->'lease'));
      RAISE EXCEPTION 'Cross-user interview operation allowed: %',op;
    EXCEPTION WHEN SQLSTATE 'P0404' THEN NULL;
    END;
  END LOOP;
  IF interview.student_command('phase10-token-b','history',NULL,NULL) <> '[]'::jsonb THEN
    RAISE EXCEPTION 'Other learner history disclosed a session';
  END IF;
  PERFORM interview.student_command('phase10-token-a','finish',sid,
    jsonb_build_object('lease',start_lease->'lease','question','How do you confirm a healthy target?'));
  BEGIN
    PERFORM interview.student_command('phase10-token-a','begin',sid,'{"action":"evaluate","turn":0}');
    RAISE EXCEPTION 'An empty interview was evaluated';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;

  reserved := interview.student_command('phase10-token-a','begin',sid,'{"action":"message","turn":0}');
  BEGIN
    PERFORM interview.student_command('phase10-token-a','begin',sid,'{"action":"message","turn":0}');
    RAISE EXCEPTION 'Concurrent request bypassed reservation';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  PERFORM interview.student_command('phase10-token-a','finish',sid,
    jsonb_build_object('lease',reserved->'lease','answer','Try up.','question','How would you distinguish errors?'));
  BEGIN
    PERFORM interview.student_command('phase10-token-a','begin',sid,'{"action":"message","turn":0}');
    RAISE EXCEPTION 'Stale request duplicated a turn';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;

  FOR i IN 1..4 LOOP
    reserved := interview.student_command('phase10-token-a','begin',sid,'{"action":"message","turn":1}');
    PERFORM interview.student_command('phase10-token-a','release',sid,jsonb_build_object('lease',reserved->'lease'));
  END LOOP;
  BEGIN
    PERFORM interview.student_command('phase10-token-a','begin',sid,'{"action":"message","turn":1}');
    RAISE EXCEPTION 'Retries bypassed the session output budget';
  EXCEPTION WHEN SQLSTATE 'P0422' THEN NULL;
  END;
  reserved := interview.student_command('phase10-token-a','begin',sid,'{"action":"evaluate","turn":1}');
  BEGIN
    PERFORM interview.student_command('phase10-token-a','finish',sid,
      jsonb_build_object('lease',reserved->'lease','scorecard',score || '{"weak_concept_slugs":["git"]}'));
    RAISE EXCEPTION 'Out-of-scope evidence was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  details := interview.student_command('phase10-token-a','finish',sid,
    jsonb_build_object('lease',reserved->'lease','scorecard',score));
  IF details->'scorecard' IS DISTINCT FROM score OR (details->>'outputReserved')::int <> 6144
    OR jsonb_array_length(details->'messages') <> 3
    OR interview.mastery_evidence('phase10-token-a') <> '{"prometheus":45}'::jsonb
    OR interview.mastery_evidence('phase10-token-b') <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Scorecard, transcript, budget or evidence was incorrect';
  END IF;

  FOR i IN 8..12 LOOP
    start_lease := interview.student_command('phase10-token-a','begin',NULL,setup);
    PERFORM interview.student_command('phase10-token-a','release',(start_lease->'session'->>'id')::uuid,
      jsonb_build_object('lease',start_lease->'lease'));
  END LOOP;
  BEGIN
    PERFORM interview.student_command('phase10-token-a','begin',NULL,setup);
    RAISE EXCEPTION 'The per-learner request limit was bypassed';
  EXCEPTION WHEN SQLSTATE 'P0429' THEN NULL;
  END;
  PERFORM interview.student_command('phase10-token-b','begin',NULL,setup);
END;
$journey$;
RESET ROLE;
ROLLBACK;
