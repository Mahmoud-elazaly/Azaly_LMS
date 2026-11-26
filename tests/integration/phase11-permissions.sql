DO $permissions$
DECLARE
  unsafe_routine text;
BEGIN
  SELECT p.oid::regprocedure::text INTO unsafe_routine
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_roles r ON r.oid = p.proowner
  WHERE p.prosecdef AND n.nspname IN ('public','identity','authoring','learning','real_lab','knowledge','interview')
    AND (r.rolcanlogin OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
      OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
      OR EXISTS (SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
      OR EXISTS (SELECT FROM pg_roles runtime WHERE runtime.rolname IN ('academy_reader','academy_auth_runtime',
        'academy_authoring_runtime','academy_learner_runtime','academy_real_lab_runtime')
        AND pg_has_role(runtime.oid, r.oid, 'MEMBER')));
  IF FOUND THEN RAISE EXCEPTION 'Unsafe definer routine %', unsafe_routine; END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'identity' AND p.prosecdef AND p.proowner = 'academy_identity_definer'::regrole) <> 6
    OR has_function_privilege('academy_auth_runtime','identity.account_manager(text)','EXECUTE')
    OR NOT has_function_privilege('academy_auth_runtime','identity.activate_invitation(text,text)','EXECUTE')
    OR has_column_privilege('academy_auth_runtime','identity."user"','role','UPDATE')
    OR has_column_privilege('academy_auth_runtime','identity.invitation','token_hash','SELECT')
    OR has_table_privilege('academy_auth_runtime','identity.account_rate_limit','SELECT,INSERT,UPDATE,DELETE')
    OR has_column_privilege('academy_identity_definer','identity.account','password','SELECT')
    OR has_table_privilege('academy_identity_definer','authoring.drafts','SELECT,INSERT,UPDATE,DELETE')
    OR has_schema_privilege('academy_identity_definer','identity','CREATE') THEN
    RAISE EXCEPTION 'Identity routines have unintended owners or grants';
  END IF;
END;
$permissions$;

BEGIN;
INSERT INTO identity."user" (id,name,email,role)
VALUES ('phase11-inviter','Phase 11 inviter','phase11-inviter@sql.example.test','OWNER');
INSERT INTO identity.invitation (id,name,email,role,locale,token_hash,expires_at,created_by)
VALUES ('phase11-instructor','Phase 11 instructor','phase11-instructor@sql.example.test','INSTRUCTOR','en',
  repeat('a',64),now()+interval '1 hour','phase11-inviter');

SET LOCAL ROLE academy_auth_runtime;
DO $activation$
BEGIN
  IF NOT identity.activate_invitation(repeat('a',64),'synthetic-password-hash') THEN
    RAISE EXCEPTION 'Scoped staff invitation activation failed';
  END IF;
  IF NOT EXISTS (SELECT FROM identity."user" WHERE id='phase11-instructor' AND role='INSTRUCTOR') THEN
    RAISE EXCEPTION 'Staff activation lost the assigned role';
  END IF;
  IF identity.activate_invitation(repeat('a',64),'synthetic-password-hash') THEN
    RAISE EXCEPTION 'Staff invitation could be replayed';
  END IF;
END;
$activation$;
RESET ROLE;
ROLLBACK;
