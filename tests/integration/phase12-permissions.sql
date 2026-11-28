BEGIN;

DO $permissions$
DECLARE
  student_command regprocedure := 'real_lab.student(text,text,uuid,text)'::regprocedure;
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
    WHERE p.oid = student_command AND p.prosecdef AND 'search_path=pg_catalog' = ANY(p.proconfig)
      AND r.rolname = 'academy_real_lab_definer' AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls
  ) OR EXISTS (
    SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) permissions
    WHERE p.oid = student_command AND permissions.grantee = 0
  ) OR NOT has_function_privilege('academy_learner_runtime', student_command, 'EXECUTE')
    OR pg_has_role('academy_learner_runtime', 'academy_real_lab_definer', 'MEMBER')
    OR has_function_privilege('academy_real_lab_runtime', student_command, 'EXECUTE')
    OR has_function_privilege('academy_learner_runtime', 'real_lab.consume(text)', 'EXECUTE')
    OR has_function_privilege('academy_learner_runtime', 'real_lab.finish(uuid,uuid,boolean,boolean,boolean,text)', 'EXECUTE')
    OR EXISTS (
      SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN (VALUES ('academy_real_lab_runtime'::name), ('academy_learner_runtime'::name)) AS runtime(role_name)
      WHERE n.nspname = 'real_lab' AND c.relkind = 'r'
        AND (has_any_column_privilege(runtime.role_name, c.oid, 'SELECT, INSERT, UPDATE')
          OR has_table_privilege(runtime.role_name, c.oid, 'DELETE, TRUNCATE'))
    )
  THEN RAISE EXCEPTION 'Unexpected multi-track lab privileges'; END IF;

  IF (SELECT count(*) FROM knowledge.lab_concepts m JOIN knowledge.concepts c ON c.id = m.concept_id
    WHERE (m.real_template_version, c.slug, c.track_slug) IN (
      ('linux-file-permissions@1','linux-file-permissions','linux-os'),
      ('prometheus-exposition@1','prometheus-exposition','observability'))) <> 2
  THEN RAISE EXCEPTION 'A Real Lab has no matching track concept'; END IF;
END;
$permissions$;

INSERT INTO identity."user"(id, name, email) VALUES
  ('p12-alice','Learner A','p12-alice@example.test'),
  ('p12-bob','Learner B','p12-bob@example.test');
INSERT INTO identity.session(id, token, user_id, expires_at) VALUES
  ('p12-a1','p12-a1-token','p12-alice',now() + interval '1 hour'),
  ('p12-a2','p12-a2-token','p12-alice',now() + interval '1 hour'),
  ('p12-b1','p12-b1-token','p12-bob',now() + interval '1 hour');

SET LOCAL ROLE academy_learner_runtime;
DO $ownership$
DECLARE
  launch uuid := gen_random_uuid();
  lab jsonb;
  key uuid;
  other_token text;
BEGIN
  BEGIN
    PERFORM real_lab.student('p12-a1-token','start',gen_random_uuid(),'unapproved@1');
    RAISE EXCEPTION 'Unknown launch template accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  lab := real_lab.student('p12-a1-token','start',launch,'linux-file-permissions@1');
  key := (lab->>'id')::uuid;
  IF lab->>'templateVersion' IS DISTINCT FROM 'linux-file-permissions@1' OR lab IS DISTINCT FROM
    real_lab.student('p12-a1-token','start',launch,'linux-file-permissions@1')
  THEN RAISE EXCEPTION 'Incorrect or non-idempotent launch'; END IF;
  BEGIN
    PERFORM real_lab.student('p12-a1-token','start',launch,'prometheus-exposition@1');
    RAISE EXCEPTION 'A launch idempotency key changed templates';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM real_lab.student('p12-a2-token','start',gen_random_uuid(),'prometheus-exposition@1');
    RAISE EXCEPTION 'A second track bypassed the learner cap';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  FOREACH other_token IN ARRAY ARRAY['p12-a2-token','p12-b1-token'] LOOP
    IF real_lab.student(other_token,'get',NULL,NULL) IS NOT NULL THEN
      RAISE EXCEPTION 'Another session or learner saw an attempt';
    END IF;
    BEGIN
      PERFORM real_lab.student(other_token,'stop',key,NULL);
      RAISE EXCEPTION 'Another session or learner could stop an attempt';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
END;
$ownership$;
RESET ROLE;

SET LOCAL ROLE academy_real_lab_runtime;
SELECT real_lab.claim() AS linux_job \gset
SELECT real_lab.finish((:'linux_job'::jsonb->>'id')::uuid, (:'linux_job'::jsonb->>'lease')::uuid, true, NULL, NULL, NULL);
RESET ROLE;

SET LOCAL ROLE academy_learner_runtime;
SELECT real_lab.student('p12-a1-token','preview',(:'linux_job'::jsonb->>'id')::uuid,NULL)->>'grant' AS preview_grant \gset
RESET ROLE;
SET LOCAL ROLE academy_real_lab_runtime;
SELECT (real_lab.consume(:'preview_grant')->>'templateVersion' = 'linux-file-permissions@1') AS correct_template \gset
\if :correct_template
\else
  \quit 1
\endif
RESET ROLE;

SET LOCAL ROLE academy_learner_runtime;
SELECT real_lab.student('p12-a1-token','validate',(:'linux_job'::jsonb->>'id')::uuid,NULL);
RESET ROLE;

SET LOCAL ROLE academy_real_lab_runtime;
DO $checks$
DECLARE
  job jsonb := real_lab.claim();
  id uuid := (job->>'id')::uuid;
  lease uuid := (job->>'lease')::uuid;
BEGIN
  IF job->>'templateVersion' IS DISTINCT FROM 'linux-file-permissions@1' OR job->>'operation' IS DISTINCT FROM 'check' THEN
    RAISE EXCEPTION 'Claim lost the selected template';
  END IF;
  BEGIN
    PERFORM real_lab.finish(id,lease,true,true,true,'prometheus-exposition@1');
    RAISE EXCEPTION 'An unrelated checker could certify the attempt';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF NOT real_lab.finish(id,lease,true,true,true,'linux-umask@1') THEN
    RAISE EXCEPTION 'The matching checker could not record the verdict';
  END IF;
END;
$checks$;
RESET ROLE;

SET LOCAL ROLE academy_learner_runtime;
DO $evidence$
DECLARE
  actor jsonb := knowledge.learner_evidence('p12-a1-token','en');
  other jsonb := knowledge.learner_evidence('p12-b1-token','en');
  credit jsonb := '{"concepts":[{"slug":"linux-file-permissions","items":[{"id":"linux-file-permissions@1","provenance":"SYSTEM_VERIFIED"}]}]}';
BEGIN
  IF actor @> credit IS DISTINCT FROM true OR other @> credit IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Real Lab mastery is missing or crosses learner boundaries';
  END IF;
END;
$evidence$;
RESET ROLE;

ROLLBACK;
