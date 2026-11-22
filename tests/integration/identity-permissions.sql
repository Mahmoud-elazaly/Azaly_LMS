BEGIN;
SET LOCAL ROLE academy_auth_runtime;

INSERT INTO identity."user" (id, name, email)
VALUES ('phase2-permissions-check', 'Permission check', 'phase2-permissions@example.test');

DO $check$
BEGIN
  IF (SELECT role FROM identity."user" WHERE id = 'phase2-permissions-check') IS DISTINCT FROM 'STUDENT' THEN
    RAISE EXCEPTION 'New identity did not default to STUDENT';
  END IF;
  BEGIN
    UPDATE identity."user" SET role = 'OWNER' WHERE id = 'phase2-permissions-check';
    RAISE EXCEPTION 'The authentication runtime can change roles';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.courses;
    RAISE EXCEPTION 'The authentication runtime can read the catalog';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM 1 FROM identity.audit_event;
    RAISE EXCEPTION 'The authentication runtime can read administrative audit records';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$check$;

INSERT INTO identity."session" (id, token, user_id, expires_at)
VALUES ('phase2-permissions-check', 'phase2-permissions-check', 'phase2-permissions-check', now());
DELETE FROM identity."session" WHERE id = 'phase2-permissions-check';
RESET ROLE;
SET LOCAL ROLE academy_reader;

DO $check$
BEGIN
  PERFORM 1 FROM public.courses;
  BEGIN
    PERFORM 1 FROM identity."user";
    RAISE EXCEPTION 'The catalog reader can read identity data';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    INSERT INTO public.courses (slug) VALUES ('phase2-permissions-check');
    RAISE EXCEPTION 'The catalog reader can write catalog data';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$check$;

ROLLBACK;

-- Slice 2's database guard also covers ORM inserts that supply every mapped column.
BEGIN;
SET LOCAL ROLE academy_auth_runtime;
DO $check$
BEGIN
  BEGIN
    INSERT INTO identity."user" (id, name, email, role)
    VALUES ('phase2-illegal-owner', 'Permission check', 'phase2-illegal@example.test', 'OWNER');
    RAISE EXCEPTION 'The authentication runtime can insert an Owner';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$check$;
RESET ROLE;
INSERT INTO identity."user" (id, name, email, role)
VALUES ('phase2-protected-owner', 'Permission check', 'phase2-owner@example.test', 'OWNER');
DO $check$
BEGIN
  BEGIN
    UPDATE identity."user" SET role = 'STUDENT' WHERE id = 'phase2-protected-owner';
    RAISE EXCEPTION 'The active Owner can be demoted';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    DELETE FROM identity."user" WHERE id = 'phase2-protected-owner';
    RAISE EXCEPTION 'The active Owner can be deleted';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$check$;
ROLLBACK;
