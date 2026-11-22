BEGIN;
INSERT INTO identity."user" (id, name, email, role) VALUES
  ('phase3-student', 'Student', 'phase3-student@example.test', 'STUDENT'),
  ('phase3-author', 'Instructor', 'phase3-author@example.test', 'INSTRUCTOR'),
  ('phase3-other', 'Other Instructor', 'phase3-other@example.test', 'INSTRUCTOR');
INSERT INTO identity.session (id, token, user_id, expires_at) VALUES
  ('phase3-student', 'phase3-student-token', 'phase3-student', now() + interval '1 hour'),
  ('phase3-author', 'phase3-author-token', 'phase3-author', now() + interval '1 hour'),
  ('phase3-other', 'phase3-other-token', 'phase3-other', now() + interval '1 hour');

SET LOCAL ROLE academy_authoring_runtime;
DO $check$
DECLARE
  course uuid;
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_roles r ON r.oid = p.proowner
    WHERE n.nspname = 'authoring' AND p.proname = 'course_command'
      AND r.rolname = 'academy_authoring_definer' AND NOT r.rolsuper AND NOT r.rolcanlogin
  ) THEN
    RAISE EXCEPTION 'Authoring function owner is not the restricted definer';
  END IF;
  IF has_table_privilege(current_user, 'authoring.drafts', 'SELECT, INSERT, UPDATE, DELETE')
     OR has_table_privilege(current_user, 'public.courses', 'INSERT, UPDATE, DELETE')
     OR has_schema_privilege(current_user, 'identity', 'USAGE') THEN
    RAISE EXCEPTION 'Authoring runtime has direct table privileges';
  END IF;
  BEGIN
    PERFORM authoring.course_command('phase3-student-token', 'list', NULL, NULL, NULL);
    RAISE EXCEPTION 'Student passed the database boundary';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  course := (authoring.course_command('phase3-author-token', 'create', NULL, '{"slug":"phase3-permission-probe"}', NULL)->>'id')::uuid;
  BEGIN
    PERFORM authoring.course_command('phase3-other-token', 'read', course, NULL, NULL);
    RAISE EXCEPTION 'Unassigned instructor read the draft';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM authoring.course_command('phase3-author-token', 'publish', course, NULL, 1);
    RAISE EXCEPTION 'An empty draft was published';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$check$;

RESET ROLE;
SET LOCAL ROLE academy_reader;
DO $check$
BEGIN
  IF has_schema_privilege(current_user, 'authoring', 'USAGE')
     OR has_table_privilege(current_user, 'public.courses', 'INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION 'Catalog privileges were widened';
  END IF;
  PERFORM 1 FROM public.course_versions;
END;
$check$;
RESET ROLE;
SET LOCAL ROLE academy_auth_runtime;
DO $check$
BEGIN
  IF has_schema_privilege(current_user, 'authoring', 'USAGE') THEN
    RAISE EXCEPTION 'Authentication runtime has authoring access';
  END IF;
END;
$check$;
ROLLBACK;
