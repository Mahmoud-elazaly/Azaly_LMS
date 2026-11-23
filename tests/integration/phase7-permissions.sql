\set ON_ERROR_STOP on
BEGIN;
INSERT INTO identity."user" (id, name, email) VALUES
  ('phase7-student-a', 'Lab A', 'phase7-a@sql.example.test'),
  ('phase7-student-b', 'Lab B', 'phase7-b@sql.example.test');

INSERT INTO identity.session (id, token, user_id, expires_at) VALUES
  ('phase7-session-a1', 'phase7-token-a1', 'phase7-student-a', now() + interval '1 hour'),
  ('phase7-session-a2', 'phase7-token-a2', 'phase7-student-a', now() + interval '1 hour'),
  ('phase7-session-b1', 'phase7-token-b1', 'phase7-student-b', now() + interval '1 hour');

DO $grants$
DECLARE runtime text;
BEGIN
  FOREACH runtime IN ARRAY ARRAY['academy_reader', 'academy_auth_runtime', 'academy_authoring_runtime',
    'academy_learner_runtime', 'academy_real_lab_runtime'] LOOP
    IF has_table_privilege(runtime, 'real_lab.attempts', 'SELECT,INSERT,UPDATE,DELETE') OR
       has_table_privilege(runtime, 'real_lab.checks', 'SELECT,INSERT,UPDATE,DELETE') OR
       has_table_privilege(runtime, 'real_lab.grants', 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'Lab tables were exposed to %', runtime;
    END IF;
  END LOOP;
  IF has_schema_privilege('academy_real_lab_runtime', 'identity', 'USAGE') OR
     has_table_privilege('academy_real_lab_runtime', 'public.courses', 'SELECT,INSERT,UPDATE,DELETE') OR
     has_function_privilege('academy_learner_runtime', 'real_lab.finish(uuid,uuid,boolean,boolean,boolean,text)', 'EXECUTE') OR
     has_function_privilege('academy_real_lab_runtime', 'real_lab.student(text,text,uuid)', 'EXECUTE') OR
     has_function_privilege('academy_reader', 'real_lab.claim()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Lab function privileges overlap';
  END IF;
  IF EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='real_lab' AND (p.proowner <> 'academy_real_lab_definer'::regrole::oid OR
      EXISTS (SELECT FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE') OR
      (p.proname NOT IN ('live_session','attempt_view') AND NOT p.prosecdef))) THEN
    RAISE EXCEPTION 'Lab function owner, PUBLIC ACL or definer privilege is incorrect';
  END IF;
END;
$grants$;

SET LOCAL ROLE academy_learner_runtime;
DO $learner$
DECLARE
  first_attempt jsonb;
  draft_id uuid;
BEGIN
  first_attempt := real_lab.student('phase7-token-a1', 'start', '90f34fd6-a72a-4000-b076-358c85347e0f');
  draft_id := (first_attempt->>'id')::uuid;
  IF first_attempt IS DISTINCT FROM real_lab.student('phase7-token-a1', 'start', '90f34fd6-a72a-4000-b076-358c85347e0f') THEN
    RAISE EXCEPTION 'Idempotent launch returned a different attempt';
  END IF;
  BEGIN
    PERFORM real_lab.student('phase7-token-a2', 'start', gen_random_uuid());
    RAISE EXCEPTION 'Same learner launched a concurrent lab';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM real_lab.student('phase7-token-b1', 'preview', draft_id);
    RAISE EXCEPTION 'Other learner reached the workspace';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM real_lab.student('phase7-token-a2', 'stop', draft_id);
    RAISE EXCEPTION 'Second session ended the workspace';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM real_lab.finish(draft_id, gen_random_uuid(), true, true, true, 'nginx-route@1');
    RAISE EXCEPTION 'Learner supplied a checker verdict';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$learner$;

SET LOCAL ROLE academy_real_lab_runtime;
SELECT real_lab.claim() AS provision \gset
SELECT real_lab.finish((:'provision'::jsonb->>'id')::uuid, (:'provision'::jsonb->>'lease')::uuid, true, NULL, NULL, NULL);
SET LOCAL ROLE academy_learner_runtime;
SELECT real_lab.student('phase7-token-a1', 'preview', (:'provision'::jsonb->>'id')::uuid)->>'grant' AS grant_token \gset
SET LOCAL ROLE academy_real_lab_runtime;
SELECT (real_lab.consume(:'grant_token')->>'operation' = 'preview') AS grant_accepted \gset
\if :grant_accepted
\else
SELECT 1/0;
\endif
SELECT (real_lab.consume(:'grant_token') IS NULL) AS replay_rejected \gset
\if :replay_rejected
\else
SELECT 1/0;
\endif

SET LOCAL ROLE academy_learner_runtime;
SELECT real_lab.student('phase7-token-a1', 'validate', (:'provision'::jsonb->>'id')::uuid);
SET LOCAL ROLE academy_real_lab_runtime;
SELECT real_lab.claim() AS checking \gset
RESET ROLE;
UPDATE real_lab.attempts SET expires_at = clock_timestamp() - interval '1 second' WHERE id = (:'checking'::jsonb->>'id')::uuid;
SET LOCAL ROLE academy_real_lab_runtime;
SELECT (NOT real_lab.finish((:'checking'::jsonb->>'id')::uuid, (:'checking'::jsonb->>'lease')::uuid,
  true, true, true, 'nginx-route@1')) AS late_check_rejected \gset
\if :late_check_rejected
\else
SELECT 1/0;
\endif
RESET ROLE;
DO $expired$
BEGIN
  IF EXISTS (SELECT FROM real_lab.checks) OR NOT EXISTS (
    SELECT FROM real_lab.attempts WHERE learner_id='phase7-student-a' AND end_reason='EXPIRED' AND state='STOPPING') THEN
    RAISE EXCEPTION 'Expired attempt retained trusted completion or missed cleanup';
  END IF;
END;
$expired$;

INSERT INTO real_lab.attempts (learner_id, session_id, request_id, expires_at, state, destroyed_at, end_reason)
SELECT 'phase7-student-b', 'phase7-session-b1', gen_random_uuid(), now(), 'DESTROYED', now(), 'STOPPED'
FROM generate_series(1,6);
SET LOCAL ROLE academy_learner_runtime;
DO $quota$
BEGIN
  BEGIN
    PERFORM real_lab.student('phase7-token-b1', 'start', gen_random_uuid());
    RAISE EXCEPTION 'Hourly launch quota was bypassed';
  EXCEPTION WHEN program_limit_exceeded THEN NULL; END;
END;
$quota$;
RESET ROLE;
ROLLBACK;
