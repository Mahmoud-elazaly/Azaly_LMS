CREATE TABLE "authoring"."bank_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"question" jsonb NOT NULL,
	"edit_version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning"."guided_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"lab_id" uuid NOT NULL,
	"checkpoints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"completion_provenance" text,
	"submitted_at" timestamp with time zone,
	CONSTRAINT "guided_attempts_enrollment_lab_unique" UNIQUE("enrollment_id","lab_id"),
	CONSTRAINT "guided_attempts_checkpoints_array" CHECK (jsonb_typeof("learning"."guided_attempts"."checkpoints") = 'array'),
	CONSTRAINT "guided_attempts_evidence_limit" CHECK (length("learning"."guided_attempts"."evidence") <= 4000),
	CONSTRAINT "guided_attempts_self_report_only" CHECK (("learning"."guided_attempts"."submitted_at" IS NULL AND "learning"."guided_attempts"."completion_provenance" IS NULL) OR ("learning"."guided_attempts"."submitted_at" IS NOT NULL AND "learning"."guided_attempts"."completion_provenance" IS NOT DISTINCT FROM 'SELF_REPORTED'))
);
--> statement-breakpoint
CREATE TABLE "learning"."guided_reviews" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"reviewer_id" text NOT NULL,
	"completion_provenance" text DEFAULT 'INSTRUCTOR_REVIEWED' NOT NULL,
	"decision" text NOT NULL,
	"feedback" text DEFAULT '' NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guided_reviews_instructor_only" CHECK ("learning"."guided_reviews"."completion_provenance" = 'INSTRUCTOR_REVIEWED'),
	CONSTRAINT "guided_reviews_decision" CHECK ("learning"."guided_reviews"."decision" IN ('APPROVED', 'NOT_APPROVED')),
	CONSTRAINT "guided_reviews_feedback_limit" CHECK (length("learning"."guided_reviews"."feedback") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "authoring"."bank_questions" ADD CONSTRAINT "bank_questions_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "identity"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."guided_attempts" ADD CONSTRAINT "guided_attempts_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "learning"."enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."guided_reviews" ADD CONSTRAINT "guided_reviews_attempt_id_guided_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "learning"."guided_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."guided_reviews" ADD CONSTRAINT "guided_reviews_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "identity"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_questions_owner_idx" ON "authoring"."bank_questions" USING btree ("owner_id");
--> statement-breakpoint
CREATE FUNCTION authoring.guard_guided_templates() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $templates$
DECLARE
  labs jsonb := NEW.document->'guidedLabs';
  lab jsonb;
  language text;
BEGIN
  IF labs IS NULL THEN RETURN NEW; END IF;
  IF jsonb_typeof(labs) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid Guided Labs' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(labs) > 20 OR EXISTS (
    SELECT FROM jsonb_array_elements(labs) entry GROUP BY entry->>'id' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Invalid Guided Lab count or IDs' USING ERRCODE = '22023';
  END IF;
  FOR lab IN SELECT value FROM jsonb_array_elements(labs) LOOP
    IF jsonb_typeof(lab) IS DISTINCT FROM 'object'
      OR lab->>'labMode' IS DISTINCT FROM 'GUIDED'
      OR lab->>'id' IS NULL OR lab->>'id' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      OR lab - ARRAY['id','labMode','titles','instructions','commands','starter','checkpoints','evidencePrompt'] <> '{}'::jsonb
      OR jsonb_typeof(lab->'titles') IS DISTINCT FROM 'object'
      OR jsonb_typeof(lab->'instructions') IS DISTINCT FROM 'object'
      OR jsonb_typeof(lab->'commands') IS DISTINCT FROM 'string'
      OR jsonb_typeof(lab->'starter') IS DISTINCT FROM 'string'
      OR jsonb_typeof(lab->'evidencePrompt') IS DISTINCT FROM 'object'
      OR jsonb_typeof(lab->'checkpoints') IS DISTINCT FROM 'array'
      OR length(lab->>'commands') > 12000 OR length(lab->>'starter') > 12000 THEN
      RAISE EXCEPTION 'Invalid Guided Lab template' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(lab->'checkpoints') > 30 OR EXISTS (
      SELECT FROM jsonb_array_elements(lab->'checkpoints') step
      WHERE jsonb_typeof(step) IS DISTINCT FROM 'object'
        OR step->>'id' IS NULL OR step->>'id' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
        OR step - ARRAY['id','labels'] <> '{}'::jsonb
        OR jsonb_typeof(step->'labels') IS DISTINCT FROM 'object'
    ) OR EXISTS (
      SELECT FROM jsonb_array_elements(lab->'checkpoints') step GROUP BY step->>'id' HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'Invalid Guided Lab checkpoints' USING ERRCODE = '22023';
    END IF;
    IF TG_TABLE_NAME = 'snapshots' THEN
      FOREACH language IN ARRAY ARRAY['ar','en'] LOOP
        IF coalesce(length(btrim(lab->'titles'->>language)), 0) = 0
          OR coalesce(length(btrim(lab->'instructions'->>language)), 0) = 0
          OR jsonb_array_length(lab->'checkpoints') = 0 OR EXISTS (
            SELECT FROM jsonb_array_elements(lab->'checkpoints') step
            WHERE coalesce(length(btrim(step->'labels'->>language)), 0) = 0
          ) THEN
          RAISE EXCEPTION 'Incomplete Guided Lab translation' USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$templates$;
CREATE TRIGGER draft_guided_templates BEFORE INSERT OR UPDATE OF document ON authoring.drafts
  FOR EACH ROW EXECUTE FUNCTION authoring.guard_guided_templates();
CREATE TRIGGER snapshot_guided_templates BEFORE INSERT ON authoring.snapshots
  FOR EACH ROW EXECUTE FUNCTION authoring.guard_guided_templates();
REVOKE ALL ON FUNCTION authoring.guard_guided_templates() FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION authoring.phase5_actor(actor_token text)
RETURNS TABLE (actor_id text, actor_role identity.user_role)
LANGUAGE sql SET search_path = pg_catalog AS $actor$
  SELECT u.id, u.role FROM identity."user" u JOIN identity.session s ON s.user_id = u.id
  WHERE s.token = actor_token AND s.expires_at > clock_timestamp()
    AND s.impersonated_by IS NULL AND NOT u.banned AND u.role IN ('OWNER','ADMIN','INSTRUCTOR')
  FOR SHARE OF s, u;
$actor$;
REVOKE ALL ON FUNCTION authoring.phase5_actor(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION authoring.phase5_actor(text) TO academy_authoring_definer;
--> statement-breakpoint
CREATE FUNCTION authoring.bank_command(actor_token text, operation text, question_key uuid, payload jsonb, expected integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $bank$
DECLARE
  actor record;
  entry authoring.bank_questions%ROWTYPE;
  translated jsonb;
  language text;
  ar_count integer;
BEGIN
  SELECT * INTO actor FROM authoring.phase5_actor(actor_token);
  IF NOT FOUND THEN RAISE EXCEPTION 'Question bank access denied' USING ERRCODE = '42501'; END IF;

  IF operation = 'list' THEN
    RETURN coalesce((
      SELECT jsonb_agg(b.question || jsonb_build_object('id', b.id, 'version', b.edit_version,
        'archived', b.archived_at IS NOT NULL, 'ownerId', b.owner_id) ORDER BY b.archived_at IS NOT NULL, b.updated_at DESC, b.id)
      FROM authoring.bank_questions b WHERE actor.actor_role <> 'INSTRUCTOR' OR b.owner_id = actor.actor_id
    ), '[]'::jsonb);
  END IF;
  IF operation IS NULL OR operation NOT IN ('read','create','save','archive') THEN
    RAISE EXCEPTION 'Unknown question operation' USING ERRCODE = '22023';
  END IF;

  IF operation <> 'create' THEN
    SELECT * INTO entry FROM authoring.bank_questions b WHERE b.id = question_key
      AND (actor.actor_role <> 'INSTRUCTOR' OR b.owner_id = actor.actor_id) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Question unavailable' USING ERRCODE = '42501'; END IF;
    IF operation = 'read' THEN
      RETURN entry.question || jsonb_build_object('id', entry.id, 'version', entry.edit_version, 'archived', entry.archived_at IS NOT NULL, 'ownerId', entry.owner_id);
    END IF;
    IF expected IS DISTINCT FROM entry.edit_version OR entry.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Stale or archived question' USING ERRCODE = '40001';
    END IF;
  END IF;

  IF operation IN ('create','save') THEN
    IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR octet_length(payload::text) > 20000
      OR payload - ARRAY['correct','translations','tags'] <> '{}'::jsonb
      OR coalesce(payload->>'correct','') !~ '^[0-3]$'
      OR jsonb_typeof(payload->'correct') IS DISTINCT FROM 'number'
      OR jsonb_typeof(payload->'translations') IS DISTINCT FROM 'object'
      OR (payload->'translations') - ARRAY['ar','en'] <> '{}'::jsonb
      OR jsonb_typeof(payload->'tags') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid bank question' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(payload->'tags') > 12 OR EXISTS (
      SELECT FROM jsonb_array_elements(payload->'tags') tag
      WHERE jsonb_typeof(tag) <> 'string' OR length(btrim(tag #>> '{}')) NOT BETWEEN 1 AND 40
    ) THEN RAISE EXCEPTION 'Invalid question tags' USING ERRCODE = '22023'; END IF;
    FOREACH language IN ARRAY ARRAY['ar','en'] LOOP
      translated := payload->'translations'->language;
      IF jsonb_typeof(translated) IS DISTINCT FROM 'object'
        OR translated - ARRAY['prompt','choices','explanation'] <> '{}'::jsonb
        OR jsonb_typeof(translated->'prompt') IS DISTINCT FROM 'string'
        OR jsonb_typeof(translated->'explanation') IS DISTINCT FROM 'string'
        OR length(btrim(translated->>'prompt')) NOT BETWEEN 1 AND 160
        OR length(btrim(translated->>'explanation')) NOT BETWEEN 1 AND 2000
        OR jsonb_typeof(translated->'choices') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Invalid question translation' USING ERRCODE = '22023';
      END IF;
      IF jsonb_array_length(translated->'choices') NOT BETWEEN 2 AND 4 OR EXISTS (
        SELECT FROM jsonb_array_elements(translated->'choices') choice
        WHERE jsonb_typeof(choice) <> 'string' OR length(btrim(choice #>> '{}')) NOT BETWEEN 1 AND 300
      ) THEN RAISE EXCEPTION 'Invalid question choices' USING ERRCODE = '22023'; END IF;
      IF language = 'ar' THEN ar_count := jsonb_array_length(translated->'choices'); END IF;
      IF jsonb_array_length(translated->'choices') <> ar_count OR (payload->>'correct')::integer >= ar_count THEN
        RAISE EXCEPTION 'Invalid answer index' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  IF operation = 'create' THEN
    INSERT INTO authoring.bank_questions(owner_id, question) VALUES (actor.actor_id, payload) RETURNING * INTO entry;
  ELSIF operation = 'save' THEN
    UPDATE authoring.bank_questions SET question = payload, edit_version = edit_version + 1,
      updated_at = clock_timestamp() WHERE id = question_key RETURNING * INTO entry;
  ELSE
    UPDATE authoring.bank_questions SET archived_at = clock_timestamp(), edit_version = edit_version + 1,
      updated_at = clock_timestamp() WHERE id = question_key RETURNING * INTO entry;
  END IF;
  RETURN entry.question || jsonb_build_object('id', entry.id, 'version', entry.edit_version, 'archived', entry.archived_at IS NOT NULL, 'ownerId', entry.owner_id);
END;
$bank$;
--> statement-breakpoint
CREATE FUNCTION learning.guided_attempt_json(a learning.guided_attempts, r learning.guided_reviews)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog AS $report$
  SELECT CASE WHEN a.id IS NOT NULL THEN jsonb_build_object(
    'id', a.id, 'checkpointIds', a.checkpoints, 'evidence', a.evidence,
    'completionProvenance', a.completion_provenance, 'submittedAt', a.submitted_at,
    'review', CASE WHEN r.attempt_id IS NOT NULL THEN jsonb_build_object(
      'completionProvenance', r.completion_provenance, 'decision', r.decision,
      'feedback', r.feedback, 'reviewedAt', r.reviewed_at) END
  ) END;
$report$;
REVOKE ALL ON FUNCTION learning.guided_attempt_json(learning.guided_attempts, learning.guided_reviews) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION learning.guided_attempt_json(learning.guided_attempts, learning.guided_reviews)
  TO academy_authoring_definer, academy_learner_definer;
--> statement-breakpoint
CREATE FUNCTION learning.guided_command(actor_token text, operation text, enrollment_key uuid,
  locale_key public.course_locale, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $guided$
DECLARE
  actor text;
  enrollment learning.enrollments%ROWTYPE;
  snapshot jsonb;
  lab jsonb;
  lab_key uuid;
  selected_steps jsonb;
  attempt learning.guided_attempts%ROWTYPE;
  review learning.guided_reviews%ROWTYPE;
BEGIN
  SELECT u.id INTO actor FROM identity."user" u JOIN identity.session s ON s.user_id = u.id
  WHERE s.token = actor_token AND s.expires_at > clock_timestamp() AND s.impersonated_by IS NULL
    AND NOT u.banned AND u.role = 'STUDENT' FOR SHARE OF s, u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student access denied' USING ERRCODE = '42501'; END IF;

  SELECT e.* INTO enrollment FROM learning.enrollments e WHERE e.id = enrollment_key AND e.student_id = actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment access denied' USING ERRCODE = '42501'; END IF;
  SELECT s.document INTO snapshot FROM authoring.snapshots s WHERE s.version_id = enrollment.version_id;

  IF operation = 'read' AND payload IS NULL THEN
    RETURN coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', entry->>'id', 'labMode', 'GUIDED',
        'title', entry->'titles'->>locale_key::text, 'instructions', entry->'instructions'->>locale_key::text,
        'commands', entry->>'commands', 'starter', entry->>'starter', 'evidencePrompt', entry->'evidencePrompt'->>locale_key::text,
        'checkpoints', (SELECT jsonb_agg(jsonb_build_object('id', step->>'id',
          'label', step->'labels'->>locale_key::text) ORDER BY step_order)
          FROM jsonb_array_elements(entry->'checkpoints') WITH ORDINALITY AS steps(step, step_order)),
        'attempt', learning.guided_attempt_json(a, r)) ORDER BY lab_order)
      FROM jsonb_array_elements(coalesce(snapshot->'guidedLabs', '[]'::jsonb)) WITH ORDINALITY AS labs(entry, lab_order)
      LEFT JOIN learning.guided_attempts a ON a.enrollment_id = enrollment.id AND a.lab_id::text = entry->>'id'
      LEFT JOIN learning.guided_reviews r ON r.attempt_id = a.id
      WHERE entry->>'labMode' = 'GUIDED' AND EXISTS (
        SELECT FROM public.course_translations t WHERE t.version_id = enrollment.version_id AND t.locale = locale_key
      )
    ), '[]'::jsonb);
  END IF;

  IF operation IS NULL OR operation NOT IN ('save','complete')
    OR jsonb_typeof(payload) IS DISTINCT FROM 'object'
    OR payload - ARRAY['labId','checkpointIds','evidence','completionProvenance'] <> '{}'::jsonb
    OR payload->>'completionProvenance' IS DISTINCT FROM 'SELF_REPORTED'
    OR jsonb_typeof(payload->'checkpointIds') IS DISTINCT FROM 'array'
    OR jsonb_typeof(payload->'evidence') IS DISTINCT FROM 'string'
    OR length(payload->>'evidence') > 4000 THEN
    RAISE EXCEPTION 'Invalid self-reported submission' USING ERRCODE = '22023';
  END IF;

  lab_key := (payload->>'labId')::uuid;
  SELECT entry INTO lab FROM jsonb_array_elements(coalesce(snapshot->'guidedLabs', '[]'::jsonb)) entry
    WHERE entry->>'id' = lab_key::text AND entry->>'labMode' = 'GUIDED';
  IF NOT FOUND OR NOT EXISTS (
    SELECT FROM public.course_translations t WHERE t.version_id = enrollment.version_id AND t.locale = locale_key
  ) THEN RAISE EXCEPTION 'Guided Lab unavailable for this enrollment' USING ERRCODE = '42501'; END IF;

  SELECT coalesce(jsonb_agg(step->>'id' ORDER BY step_order), '[]'::jsonb) INTO selected_steps
  FROM jsonb_array_elements(lab->'checkpoints') WITH ORDINALITY AS steps(step, step_order)
  WHERE (payload->'checkpointIds') ? (step->>'id');
  IF jsonb_array_length(selected_steps) <> jsonb_array_length(payload->'checkpointIds')
    OR (operation = 'complete' AND jsonb_array_length(selected_steps) <> jsonb_array_length(lab->'checkpoints')) THEN
    RAISE EXCEPTION 'Invalid checkpoint progress' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO attempt FROM learning.guided_attempts a WHERE a.enrollment_id = enrollment.id AND a.lab_id = lab_key;
  IF attempt.submitted_at IS NOT NULL THEN
    IF operation <> 'complete' OR attempt.checkpoints <> selected_steps OR attempt.evidence <> payload->>'evidence' THEN
      RAISE EXCEPTION 'The submitted evidence is fixed' USING ERRCODE = '40001';
    END IF;
    SELECT * INTO review FROM learning.guided_reviews r WHERE r.attempt_id = attempt.id;
    RETURN learning.guided_attempt_json(attempt, review);
  END IF;

  INSERT INTO learning.guided_attempts(enrollment_id, lab_id, checkpoints, evidence, completion_provenance, submitted_at)
    VALUES (enrollment.id, lab_key, selected_steps, payload->>'evidence',
      CASE WHEN operation = 'complete' THEN 'SELF_REPORTED' END,
      CASE WHEN operation = 'complete' THEN clock_timestamp() END)
    ON CONFLICT (enrollment_id, lab_id) DO UPDATE SET checkpoints = excluded.checkpoints, evidence = excluded.evidence,
      completion_provenance = excluded.completion_provenance, submitted_at = excluded.submitted_at
    RETURNING * INTO attempt;
  RETURN learning.guided_attempt_json(attempt, NULL);
END;
$guided$;
--> statement-breakpoint
CREATE FUNCTION authoring.guided_review_command(actor_token text, locale_key public.course_locale, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $review$
DECLARE
  actor record;
  entry learning.guided_attempts%ROWTYPE;
  course_owner text;
  review learning.guided_reviews%ROWTYPE;
BEGIN
  SELECT * INTO actor FROM authoring.phase5_actor(actor_token);
  IF NOT FOUND THEN RAISE EXCEPTION 'Review access denied' USING ERRCODE = '42501'; END IF;

  IF payload IS NULL THEN
    RETURN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'attempt', learning.guided_attempt_json(a, r), 'title', lab->'titles'->>locale_key::text,
        'course', coalesce(s.document->'translations'->locale_key::text->>'title',
          s.document->'translations'->'en'->>'title', s.document->'translations'->'ar'->>'title'),
        'learner', u.name, 'courseOwnerId', d.owner_id, 'checkpoints', (
          SELECT jsonb_agg(jsonb_build_object('id', step->>'id', 'label', step->'labels'->>locale_key::text) ORDER BY step_order)
          FROM jsonb_array_elements(lab->'checkpoints') WITH ORDINALITY AS steps(step, step_order)
        )
      ) ORDER BY r.attempt_id IS NOT NULL, a.submitted_at DESC, a.id)
      FROM learning.guided_attempts a JOIN learning.enrollments e ON e.id = a.enrollment_id
      JOIN authoring.drafts d ON d.course_id = e.course_id
      JOIN authoring.snapshots s ON s.version_id = e.version_id
      JOIN identity."user" u ON u.id = e.student_id
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.document->'guidedLabs', '[]'::jsonb)) lab
      LEFT JOIN learning.guided_reviews r ON r.attempt_id = a.id
      WHERE a.completion_provenance = 'SELF_REPORTED' AND lab->>'id' = a.lab_id::text
        AND lab->>'labMode' = 'GUIDED' AND (actor.actor_role <> 'INSTRUCTOR' OR d.owner_id = actor.actor_id)
    ), '[]'::jsonb);
  END IF;

  IF jsonb_typeof(payload) = 'object' AND payload ? 'attemptId' AND payload - 'attemptId' = '{}'::jsonb THEN
    SELECT d.owner_id INTO course_owner FROM learning.guided_attempts a
    JOIN learning.enrollments e ON e.id = a.enrollment_id JOIN authoring.drafts d ON d.course_id = e.course_id
    WHERE a.id = (payload->>'attemptId')::uuid AND a.completion_provenance = 'SELF_REPORTED'
      AND (actor.actor_role <> 'INSTRUCTOR' OR d.owner_id = actor.actor_id);
    IF NOT FOUND THEN RAISE EXCEPTION 'Attempt unavailable' USING ERRCODE = '42501'; END IF;
    RETURN jsonb_build_object('courseOwnerId', course_owner);
  END IF;

  IF jsonb_typeof(payload) IS DISTINCT FROM 'object'
    OR payload - ARRAY['attemptId','completionProvenance','decision','feedback'] <> '{}'::jsonb
    OR payload->>'completionProvenance' IS DISTINCT FROM 'INSTRUCTOR_REVIEWED'
    OR coalesce(payload->>'decision','') NOT IN ('APPROVED','NOT_APPROVED')
    OR jsonb_typeof(payload->'feedback') IS DISTINCT FROM 'string'
    OR length(payload->>'feedback') > 2000 THEN
    RAISE EXCEPTION 'Invalid instructor review' USING ERRCODE = '22023';
  END IF;
  SELECT a.* INTO entry FROM learning.guided_attempts a
  JOIN learning.enrollments e ON e.id = a.enrollment_id JOIN authoring.drafts d ON d.course_id = e.course_id
  WHERE a.id = (payload->>'attemptId')::uuid AND a.completion_provenance = 'SELF_REPORTED'
    AND (actor.actor_role <> 'INSTRUCTOR' OR d.owner_id = actor.actor_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt unavailable' USING ERRCODE = '42501'; END IF;

  INSERT INTO learning.guided_reviews(attempt_id, reviewer_id, decision, feedback)
    VALUES (entry.id, actor.actor_id, payload->>'decision', payload->>'feedback') ON CONFLICT (attempt_id) DO NOTHING;
  SELECT * INTO review FROM learning.guided_reviews r WHERE r.attempt_id = entry.id;
  IF review.reviewer_id IS DISTINCT FROM actor.actor_id OR review.decision IS DISTINCT FROM payload->>'decision'
    OR review.feedback IS DISTINCT FROM payload->>'feedback' THEN
    RAISE EXCEPTION 'Attempt already reviewed' USING ERRCODE = '40001';
  END IF;
  RETURN learning.guided_attempt_json(entry, review);
END;
$review$;
--> statement-breakpoint
GRANT SELECT, INSERT ON authoring.bank_questions TO academy_authoring_definer;
GRANT UPDATE (question, edit_version, archived_at, updated_at) ON authoring.bank_questions TO academy_authoring_definer;
GRANT USAGE ON SCHEMA learning TO academy_authoring_definer;
GRANT SELECT (name) ON identity."user" TO academy_authoring_definer;
GRANT SELECT ON authoring.snapshots, learning.enrollments, learning.guided_attempts, learning.guided_reviews TO academy_authoring_definer;
GRANT INSERT ON learning.guided_reviews TO academy_authoring_definer;
GRANT SELECT ON learning.guided_reviews TO academy_learner_definer;
GRANT SELECT, INSERT ON learning.guided_attempts TO academy_learner_definer;
GRANT UPDATE (checkpoints, evidence, completion_provenance, submitted_at) ON learning.guided_attempts TO academy_learner_definer;

REVOKE ALL ON FUNCTION authoring.bank_command(text,text,uuid,jsonb,integer),
  authoring.guided_review_command(text,public.course_locale,jsonb),
  learning.guided_command(text,text,uuid,public.course_locale,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION authoring.bank_command(text,text,uuid,jsonb,integer),
  authoring.guided_review_command(text,public.course_locale,jsonb) TO academy_authoring_runtime;
GRANT EXECUTE ON FUNCTION learning.guided_command(text,text,uuid,public.course_locale,jsonb) TO academy_learner_runtime;

GRANT CREATE ON SCHEMA authoring TO academy_authoring_definer;
ALTER FUNCTION authoring.bank_command(text,text,uuid,jsonb,integer) OWNER TO academy_authoring_definer;
ALTER FUNCTION authoring.guided_review_command(text,public.course_locale,jsonb) OWNER TO academy_authoring_definer;
REVOKE CREATE ON SCHEMA authoring FROM academy_authoring_definer;
GRANT CREATE ON SCHEMA learning TO academy_learner_definer;
ALTER FUNCTION learning.guided_command(text,text,uuid,public.course_locale,jsonb) OWNER TO academy_learner_definer;
REVOKE CREATE ON SCHEMA learning FROM academy_learner_definer;
