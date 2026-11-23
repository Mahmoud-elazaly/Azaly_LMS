BEGIN;
INSERT INTO identity."user" (id, name, email, role) VALUES
  ('phase4-student', 'Student', 'phase4-student@example.test', 'STUDENT'),
  ('phase4-other', 'Other Student', 'phase4-other@example.test', 'STUDENT'),
  ('phase4-instructor', 'Instructor', 'phase4-instructor@example.test', 'INSTRUCTOR');
INSERT INTO identity.session (id, token, user_id, expires_at) VALUES
  ('phase4-student', 'phase4-student-token', 'phase4-student', now() + interval '1 hour'),
  ('phase4-other', 'phase4-other-token', 'phase4-other', now() + interval '1 hour'),
  ('phase4-instructor', 'phase4-instructor-token', 'phase4-instructor', now() + interval '1 hour');

DO $seed$
DECLARE
  course uuid;
  revision uuid;
BEGIN
  INSERT INTO public.courses(slug) VALUES ('phase4-private-probe');
  INSERT INTO public.courses(slug) VALUES ('phase4-live-probe') RETURNING id INTO course;
  INSERT INTO public.course_versions(course_id, revision, published_at) VALUES (course, 1, now()) RETURNING id INTO revision;
  INSERT INTO public.course_translations(version_id, locale, title, summary) VALUES (revision, 'en', 'Permission probe', 'Transient data');
  INSERT INTO authoring.snapshots(version_id, document) VALUES (revision, '{
    "modules":[{"id":"62705bf4-728e-4ced-b52b-eb4004c40500","titles":{"en":"Module"},
      "lessons":[{"id":"62705bf4-728e-4ced-b52b-eb4004c40501","titles":{"en":"Lesson"},"blocks":[]}]}],
    "quizzes":[{"id":"62705bf4-728e-4ced-b52b-eb4004c40502","titles":{"en":"Quiz"},
      "questions":[{"id":"62705bf4-728e-4ced-b52b-eb4004c40503","correct":1,
        "translations":{"en":{"prompt":"Which?","choices":["Wrong","Right"]}}}]}]
  }');
END;
$seed$;

SET LOCAL ROLE academy_learner_runtime;
DO $check$
DECLARE
  enrollment uuid;
  result jsonb;
  submission jsonb := '{"quizId":"62705bf4-728e-4ced-b52b-eb4004c40502","attemptId":"62705bf4-728e-4ced-b52b-eb4004c40504",
    "answers":{"62705bf4-728e-4ced-b52b-eb4004c40503":0},"score":100}';
BEGIN
  IF has_table_privilege(current_user, 'learning.attempts', 'SELECT, INSERT, UPDATE, DELETE')
     OR has_schema_privilege(current_user, 'identity', 'USAGE') OR has_schema_privilege(current_user, 'authoring', 'USAGE') THEN
    RAISE EXCEPTION 'Learner runtime has direct table privileges';
  END IF;
  IF NOT EXISTS (
    SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_roles r ON r.oid = p.proowner
    WHERE n.nspname = 'learning' AND p.proname = 'student_command' AND r.rolname = 'academy_learner_definer'
      AND NOT r.rolsuper AND NOT r.rolcanlogin
  ) THEN RAISE EXCEPTION 'Unexpected learner command owner'; END IF;
  BEGIN
    PERFORM learning.student_command('phase4-instructor-token', 'list', NULL, 'en', NULL);
    RAISE EXCEPTION 'Instructor passed learner RBAC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM learning.student_command('phase4-student-token', 'enroll', NULL, 'en', '{"slug":"phase4-private-probe"}');
    RAISE EXCEPTION 'Draft enrollment was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  enrollment := (learning.student_command('phase4-student-token', 'enroll', NULL, 'en', '{"slug":"phase4-live-probe"}')->>'id')::uuid;
  IF enrollment IS NULL OR enrollment IS DISTINCT FROM
    (learning.student_command('phase4-student-token', 'enroll', NULL, 'en', '{"slug":"phase4-live-probe"}')->>'id')::uuid THEN
    RAISE EXCEPTION 'Enrollment replay was not idempotent';
  END IF;
  BEGIN
    PERFORM learning.student_command('phase4-other-token', 'read', enrollment, 'en', NULL);
    RAISE EXCEPTION 'Cross-student read succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM learning.student_command('phase4-student-token', 'complete', enrollment, 'en', '{"lessonId":"62705bf4-728e-4ced-b52b-eb4004c40501"}');
  result := learning.student_command('phase4-student-token', 'read', enrollment, 'en', NULL);
  IF result #> '{quizzes,0,questions,0,correct}' IS NOT NULL OR result #>> '{progress,0,completed}' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Player returned an answer key or lost progress';
  END IF;
  result := learning.student_command('phase4-student-token', 'submit', enrollment, 'en', submission);
  IF result->>'score' IS DISTINCT FROM '0' OR result->>'total' IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Server accepted the supplied grade';
  END IF;
  IF result IS DISTINCT FROM learning.student_command('phase4-student-token', 'submit', enrollment, 'en', submission) THEN
    RAISE EXCEPTION 'Identical attempt replay was not idempotent';
  END IF;
END;
$check$;
RESET ROLE;
DO $check$
BEGIN
  IF has_schema_privilege('academy_reader', 'learning', 'USAGE')
    OR has_schema_privilege('academy_auth_runtime', 'learning', 'USAGE')
    OR has_schema_privilege('academy_authoring_runtime', 'learning', 'USAGE') THEN
    RAISE EXCEPTION 'Existing runtime roles acquired learner privileges';
  END IF;
END;
$check$;
ROLLBACK;
