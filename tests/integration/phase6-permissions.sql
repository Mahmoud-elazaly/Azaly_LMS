\set ON_ERROR_STOP on
BEGIN;

DO $checks$
DECLARE
  course_key uuid;
  version_key uuid;
  login text;
BEGIN
  SELECT id INTO STRICT course_key FROM public.courses WHERE slug = 'prometheus-grafana';
  SELECT id INTO STRICT version_key FROM public.course_versions
    WHERE course_id = course_key AND revision = 1 AND published_at IS NOT NULL;
  IF (SELECT count(*) FROM public.course_versions WHERE course_id = course_key) <> 1 OR
     (SELECT count(*) FROM authoring.events WHERE course_id = course_key AND action = 'publish') <> 1 OR
     (SELECT count(*) FROM public.course_translations WHERE version_id = version_key) <> 2 OR
     (SELECT count(*) FROM authoring.bank_questions WHERE question->'tags' ? 'prometheus-grafana') <> 12 THEN
    RAISE EXCEPTION 'Unexpected curated publication or bank count after replay';
  END IF;
  IF (SELECT count(*) FROM learning.enrollments WHERE course_id = course_key AND version_id = version_key) <> 1 OR
     (SELECT count(*) FROM learning.guided_attempts a JOIN learning.enrollments e ON e.id = a.enrollment_id
      WHERE e.course_id = course_key AND a.completion_provenance = 'SELF_REPORTED') <> 4 OR
     (SELECT count(*) FROM learning.guided_reviews r JOIN learning.guided_attempts a ON a.id = r.attempt_id
      JOIN learning.enrollments e ON e.id = a.enrollment_id
      WHERE e.course_id = course_key AND r.completion_provenance = 'INSTRUCTOR_REVIEWED') <> 1 THEN
    RAISE EXCEPTION 'Curated learner enrollment or provenance was not persisted';
  END IF;

  FOREACH login IN ARRAY ARRAY['academy_reader', 'academy_auth', 'academy_author', 'academy_learner']
  LOOP
    IF has_table_privilege(login, 'authoring.snapshots', 'SELECT,INSERT,UPDATE,DELETE') OR
       has_table_privilege(login, 'authoring.drafts', 'SELECT,INSERT,UPDATE,DELETE') OR
       has_table_privilege(login, 'authoring.bank_questions', 'SELECT,INSERT,UPDATE,DELETE') OR
       has_table_privilege(login, 'learning.guided_attempts', 'SELECT,INSERT,UPDATE,DELETE') OR
       has_table_privilege(login, 'learning.guided_reviews', 'SELECT,INSERT,UPDATE,DELETE') OR
       has_table_privilege(login, 'public.course_versions', 'INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'Unexpected direct curated course permissions for %', login;
    END IF;
  END LOOP;
END;
$checks$;

ROLLBACK;
