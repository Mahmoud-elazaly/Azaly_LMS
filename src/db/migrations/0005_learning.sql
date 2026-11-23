CREATE SCHEMA learning;
REVOKE ALL ON SCHEMA learning FROM PUBLIC;
CREATE TABLE learning.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL CONSTRAINT enrollments_student_id_user_id_fk REFERENCES identity."user"(id),
  course_id uuid NOT NULL CONSTRAINT enrollments_course_id_courses_id_fk REFERENCES public.courses(id),
  version_id uuid NOT NULL CONSTRAINT enrollments_version_id_course_versions_id_fk REFERENCES public.course_versions(id),
  resume_lesson_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enrollments_student_course_unique UNIQUE (student_id, course_id)
);
CREATE TABLE learning.lesson_progress (
  enrollment_id uuid NOT NULL CONSTRAINT lesson_progress_enrollment_id_enrollments_id_fk REFERENCES learning.enrollments(id),
  lesson_id uuid NOT NULL,
  completed_at timestamptz,
  bookmarked boolean NOT NULL DEFAULT false,
  CONSTRAINT lesson_progress_enrollment_id_lesson_id_pk PRIMARY KEY (enrollment_id, lesson_id)
);
CREATE TABLE learning.attempts (
  id uuid PRIMARY KEY,
  enrollment_id uuid NOT NULL CONSTRAINT attempts_enrollment_id_enrollments_id_fk REFERENCES learning.enrollments(id),
  quiz_id uuid NOT NULL,
  answers jsonb NOT NULL,
  score integer NOT NULL,
  total integer NOT NULL,
  graded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attempts_score_range CHECK (total > 0 AND score BETWEEN 0 AND total)
);
CREATE INDEX attempts_enrollment_idx ON learning.attempts(enrollment_id);
--> statement-breakpoint
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'academy_learner_runtime') THEN
    CREATE ROLE academy_learner_runtime NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'academy_learner_definer') THEN
    CREATE ROLE academy_learner_definer NOLOGIN;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname IN ('academy_learner_runtime', 'academy_learner_definer')
    AND (rolcanlogin OR rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Learner database roles have unexpected privileges';
  END IF;
END;
$roles$;
--> statement-breakpoint
CREATE FUNCTION learning.student_command(actor_token text, operation text, enrollment_key uuid, locale_key public.course_locale, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $command$
DECLARE
  actor text;
  course_key uuid;
  revision_key uuid;
  enrollment learning.enrollments%ROWTYPE;
  snapshot jsonb;
  quiz jsonb;
  lesson_key uuid;
  attempt_key uuid;
  graded learning.attempts%ROWTYPE;
  score integer;
  total integer;
BEGIN
  SELECT u.id INTO actor FROM identity."user" u JOIN identity.session s ON s.user_id = u.id
  WHERE s.token = actor_token AND s.expires_at > clock_timestamp() AND s.impersonated_by IS NULL
    AND NOT u.banned AND u.role = 'STUDENT'
  FOR SHARE OF s, u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student access denied' USING ERRCODE = '42501'; END IF;

  IF operation = 'list' THEN
    RETURN coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', e.id, 'title', coalesce(t.title, c.slug),
        'localeAvailable', t.title IS NOT NULL,
        'completed', (SELECT count(*) FROM learning.lesson_progress p WHERE p.enrollment_id = e.id AND p.completed_at IS NOT NULL))
        ORDER BY e.created_at DESC)
      FROM learning.enrollments e JOIN public.courses c ON c.id = e.course_id
      LEFT JOIN public.course_translations t ON t.version_id = e.version_id AND t.locale = locale_key
      WHERE e.student_id = actor
    ), '[]'::jsonb);
  END IF;

  IF operation = 'enroll' THEN
    SELECT c.id INTO course_key FROM public.courses c WHERE c.slug = payload->>'slug' AND c.withdrawn_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Course unavailable' USING ERRCODE = '22023'; END IF;

    SELECT e.id INTO enrollment_key FROM learning.enrollments e WHERE e.student_id = actor AND e.course_id = course_key;
    IF FOUND THEN RETURN jsonb_build_object('id', enrollment_key); END IF;

    SELECT v.id INTO revision_key FROM public.course_versions v WHERE v.course_id = course_key
      AND v.published_at <= clock_timestamp() ORDER BY v.revision DESC LIMIT 1;
    IF revision_key IS NULL OR NOT EXISTS (SELECT FROM authoring.snapshots s WHERE s.version_id = revision_key)
       OR NOT EXISTS (SELECT FROM public.course_translations t WHERE t.version_id = revision_key AND t.locale = locale_key) THEN
      RAISE EXCEPTION 'Course unavailable' USING ERRCODE = '22023';
    END IF;

    INSERT INTO learning.enrollments (student_id, course_id, version_id) VALUES (actor, course_key, revision_key)
      ON CONFLICT (student_id, course_id) DO NOTHING;
    SELECT e.id INTO enrollment_key FROM learning.enrollments e WHERE e.student_id = actor AND e.course_id = course_key;
    RETURN jsonb_build_object('id', enrollment_key);
  END IF;

  SELECT e.* INTO enrollment FROM learning.enrollments e WHERE e.id = enrollment_key AND e.student_id = actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment access denied' USING ERRCODE = '42501'; END IF;
  SELECT s.document INTO snapshot FROM authoring.snapshots s WHERE s.version_id = enrollment.version_id;

  IF operation = 'read' THEN
    RETURN jsonb_build_object(
      'id', enrollment.id, 'resumeLessonId', enrollment.resume_lesson_id,
      'content', (SELECT jsonb_build_object('title', t.title, 'modules', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', m.value->>'id', 'title', m.value->'titles'->>locale_key::text,
          'lessons', (SELECT jsonb_agg(jsonb_build_object('id', l.value->>'id',
            'title', l.value->'titles'->>locale_key::text,
            'blocks', (SELECT jsonb_agg(jsonb_build_object('id', b.value->>'id', 'type', b.value->>'type',
              'text', b.value->'translations'->>locale_key::text) ORDER BY b.ord)
              FROM jsonb_array_elements(l.value->'blocks') WITH ORDINALITY b(value, ord))
          ) ORDER BY l.ord) FROM jsonb_array_elements(m.value->'lessons') WITH ORDINALITY l(value, ord))
        ) ORDER BY m.ord) FROM jsonb_array_elements(snapshot->'modules') WITH ORDINALITY m(value, ord)
      ), '[]'::jsonb))
        FROM public.course_translations t WHERE t.version_id = enrollment.version_id AND t.locale = locale_key),
      'progress', coalesce((SELECT jsonb_agg(jsonb_build_object('lessonId', p.lesson_id,
        'completed', p.completed_at IS NOT NULL, 'bookmarked', p.bookmarked)) FROM learning.lesson_progress p
        WHERE p.enrollment_id = enrollment.id), '[]'::jsonb),
      'quizzes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', q.value->>'id',
        'title', q.value->'titles'->>locale_key::text,
        'questions', (SELECT jsonb_agg(jsonb_build_object('id', question.value->>'id',
          'prompt', question.value->'translations'->locale_key::text->>'prompt',
          'choices', question.value->'translations'->locale_key::text->'choices') ORDER BY question.ord)
          FROM jsonb_array_elements(q.value->'questions') WITH ORDINALITY question(value, ord))) ORDER BY q.ord)
        FROM jsonb_array_elements(coalesce(snapshot->'quizzes', '[]'::jsonb)) WITH ORDINALITY q(value, ord)
        WHERE q.value->'titles'->>locale_key::text IS NOT NULL
          AND EXISTS (SELECT FROM public.course_translations t WHERE t.version_id = enrollment.version_id AND t.locale = locale_key)),
        '[]'::jsonb),
      'grades', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'quizId', a.quiz_id, 'score', a.score,
        'total', a.total, 'gradedAt', a.graded_at) ORDER BY a.graded_at DESC, a.id)
        FROM learning.attempts a WHERE a.enrollment_id = enrollment.id), '[]'::jsonb)
    );
  END IF;

  IF NOT EXISTS (SELECT FROM public.course_translations t WHERE t.version_id = enrollment.version_id AND t.locale = locale_key) THEN
    RAISE EXCEPTION 'Translation unavailable' USING ERRCODE = '22023';
  END IF;

  IF operation IN ('resume', 'complete', 'bookmark') THEN
    lesson_key := (payload->>'lessonId')::uuid;
    IF NOT EXISTS (SELECT FROM jsonb_array_elements(snapshot->'modules') m(value)
      CROSS JOIN LATERAL jsonb_array_elements(m.value->'lessons') l(value) WHERE l.value->>'id' = lesson_key::text) THEN
      RAISE EXCEPTION 'Unknown lesson' USING ERRCODE = '22023';
    END IF;
    IF operation IN ('resume', 'complete') THEN
      UPDATE learning.enrollments SET resume_lesson_id = lesson_key WHERE id = enrollment.id;
    END IF;
    IF operation = 'complete' THEN
      INSERT INTO learning.lesson_progress AS prior (enrollment_id, lesson_id, completed_at) VALUES (enrollment.id, lesson_key, now())
      ON CONFLICT (enrollment_id, lesson_id) DO UPDATE SET completed_at = coalesce(prior.completed_at, excluded.completed_at);
    END IF;
    IF operation = 'bookmark' THEN
      IF jsonb_typeof(payload->'bookmarked') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'Invalid bookmark' USING ERRCODE = '22023';
      END IF;
      INSERT INTO learning.lesson_progress (enrollment_id, lesson_id, bookmarked)
        VALUES (enrollment.id, lesson_key, (payload->>'bookmarked')::boolean)
      ON CONFLICT (enrollment_id, lesson_id) DO UPDATE SET bookmarked = excluded.bookmarked;
    END IF;
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF operation <> 'submit' THEN RAISE EXCEPTION 'Unknown student operation' USING ERRCODE = '22023'; END IF;
  SELECT q.value INTO quiz FROM jsonb_array_elements(coalesce(snapshot->'quizzes', '[]'::jsonb)) q(value)
    WHERE q.value->>'id' = payload->>'quizId' AND q.value->'titles'->>locale_key::text IS NOT NULL;
  IF NOT FOUND OR jsonb_typeof(payload->'answers') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid quiz submission' USING ERRCODE = '22023';
  END IF;

  attempt_key := (payload->>'attemptId')::uuid;
  total := jsonb_array_length(quiz->'questions');
  IF total = 0 OR (SELECT count(*) FROM jsonb_object_keys(payload->'answers')) <> total OR EXISTS (
    SELECT FROM jsonb_array_elements(quiz->'questions') q(value)
    WHERE jsonb_typeof(payload->'answers'->(q.value->>'id')) IS DISTINCT FROM 'number'
      OR coalesce(payload->'answers'->>(q.value->>'id'), '') NOT IN ('0','1','2','3')
      OR CASE WHEN (payload->'answers'->>(q.value->>'id')) IN ('0','1','2','3')
        THEN (payload->'answers'->>(q.value->>'id'))::integer >= jsonb_array_length(q.value->'translations'->locale_key::text->'choices')
        ELSE true END
  ) THEN RAISE EXCEPTION 'Invalid quiz answers' USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO score FROM jsonb_array_elements(quiz->'questions') q(value)
    WHERE payload->'answers'->(q.value->>'id') = q.value->'correct';

  INSERT INTO learning.attempts(id, enrollment_id, quiz_id, answers, score, total)
    VALUES (attempt_key, enrollment.id, (quiz->>'id')::uuid, payload->'answers', score, total) ON CONFLICT (id) DO NOTHING;
  SELECT a.* INTO graded FROM learning.attempts a WHERE a.id = attempt_key AND a.enrollment_id = enrollment.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt access denied' USING ERRCODE = '42501'; END IF;
  IF graded.quiz_id IS DISTINCT FROM (quiz->>'id')::uuid OR graded.answers IS DISTINCT FROM payload->'answers' THEN
    RAISE EXCEPTION 'Attempt already recorded' USING ERRCODE = '23505';
  END IF;
  RETURN jsonb_build_object('id', graded.id, 'score', graded.score, 'total', graded.total, 'gradedAt', graded.graded_at);
END;
$command$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION learning.student_command(text, text, uuid, public.course_locale, jsonb) FROM PUBLIC;
GRANT USAGE ON SCHEMA learning TO academy_learner_runtime;
GRANT EXECUTE ON FUNCTION learning.student_command(text, text, uuid, public.course_locale, jsonb) TO academy_learner_runtime;
GRANT USAGE ON SCHEMA identity, public, authoring, learning TO academy_learner_definer;
GRANT SELECT (id, role, banned), UPDATE (updated_at) ON identity."user" TO academy_learner_definer;
GRANT SELECT (user_id, token, expires_at, impersonated_by), UPDATE (expires_at) ON identity.session TO academy_learner_definer;
GRANT SELECT ON public.courses, public.course_versions, public.course_translations, authoring.snapshots TO academy_learner_definer;
GRANT UPDATE (withdrawn_at) ON public.courses TO academy_learner_definer;
GRANT SELECT, INSERT ON learning.enrollments, learning.lesson_progress, learning.attempts TO academy_learner_definer;
GRANT UPDATE (resume_lesson_id) ON learning.enrollments TO academy_learner_definer;
GRANT UPDATE (completed_at, bookmarked) ON learning.lesson_progress TO academy_learner_definer;
GRANT CREATE ON SCHEMA learning TO academy_learner_definer;
ALTER FUNCTION learning.student_command(text, text, uuid, public.course_locale, jsonb) OWNER TO academy_learner_definer;
REVOKE CREATE ON SCHEMA learning FROM academy_learner_definer;
