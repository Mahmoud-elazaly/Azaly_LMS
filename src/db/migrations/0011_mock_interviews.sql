CREATE SCHEMA "interview";
--> statement-breakpoint
CREATE TABLE "interview"."messages" (
	"session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"speaker" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_session_id_position_pk" PRIMARY KEY("session_id","position"),
	CONSTRAINT "interview_message_position" CHECK ("interview"."messages"."position" BETWEEN 0 AND 7 AND
    (("interview"."messages"."position" % 2 = 0 AND "interview"."messages"."speaker" = 'interviewer') OR ("interview"."messages"."position" % 2 = 1 AND "interview"."messages"."speaker" = 'learner'))),
	CONSTRAINT "interview_message_body" CHECK (length(btrim("interview"."messages"."body")) > 0 AND octet_length("interview"."messages"."body") <= 4096)
);
--> statement-breakpoint
CREATE TABLE "interview"."rate_limits" (
	"user_id" text PRIMARY KEY NOT NULL,
	"window_started" timestamp with time zone NOT NULL,
	"requests" integer NOT NULL,
	CONSTRAINT "interview_request_count" CHECK ("interview"."rate_limits"."requests" BETWEEN 1 AND 12)
);
--> statement-breakpoint
CREATE TABLE "interview"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"seniority" text NOT NULL,
	"tracks" text[] NOT NULL,
	"locale" "course_locale" NOT NULL,
	"turns" integer DEFAULT 0 NOT NULL,
	"input_reserved" integer DEFAULT 0 NOT NULL,
	"output_reserved" integer DEFAULT 0 NOT NULL,
	"scorecard_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"lease_id" uuid,
	"lease_until" timestamp with time zone,
	"lease_operation" text,
	CONSTRAINT "interview_role" CHECK ("interview"."sessions"."role" IN ('sysadmin', 'devops', 'sre')),
	CONSTRAINT "interview_seniority" CHECK ("interview"."sessions"."seniority" IN ('junior', 'mid', 'senior')),
	CONSTRAINT "interview_tracks" CHECK (cardinality("interview"."sessions"."tracks") BETWEEN 1 AND 7 AND
    "interview"."sessions"."tracks" <@ ARRAY['linux','web-proxy','git-cicd','containers','observability','security','iac']::text[]),
	CONSTRAINT "interview_budgets" CHECK ("interview"."sessions"."turns" BETWEEN 0 AND 4 AND
    "interview"."sessions"."input_reserved" BETWEEN 0 AND 65536 AND "interview"."sessions"."output_reserved" BETWEEN 0 AND 6144),
	CONSTRAINT "interview_completion" CHECK (("interview"."sessions"."completed_at" IS NULL AND "interview"."sessions"."scorecard_json" IS NULL)
    OR ("interview"."sessions"."completed_at" IS NOT NULL AND "interview"."sessions"."scorecard_json" IS NOT NULL AND jsonb_typeof("interview"."sessions"."scorecard_json") = 'object' AND "interview"."sessions"."turns" > 0)),
	CONSTRAINT "interview_lease" CHECK (("interview"."sessions"."lease_id" IS NULL AND "interview"."sessions"."lease_until" IS NULL AND "interview"."sessions"."lease_operation" IS NULL)
    OR ("interview"."sessions"."lease_id" IS NOT NULL AND "interview"."sessions"."lease_until" IS NOT NULL AND "interview"."sessions"."lease_operation" IS NOT NULL
      AND "interview"."sessions"."lease_operation" IN ('start','message','evaluate')))
);
--> statement-breakpoint
ALTER TABLE "interview"."messages" ADD CONSTRAINT "messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "interview"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview"."rate_limits" ADD CONSTRAINT "rate_limits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview"."sessions" ADD CONSTRAINT "sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interview_user_history_idx" ON "interview"."sessions" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
DO $role$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'academy_interview_definer') THEN
    CREATE ROLE academy_interview_definer NOLOGIN;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'academy_interview_definer'
    AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Unexpected interview role privileges';
  END IF;
END;
$role$;
--> statement-breakpoint
REVOKE ALL ON SCHEMA interview FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA interview FROM PUBLIC;
GRANT USAGE ON SCHEMA interview TO academy_learner_runtime;
GRANT USAGE ON SCHEMA interview, identity, knowledge, authoring, learning TO academy_interview_definer;
GRANT SELECT, INSERT, UPDATE, DELETE ON interview.sessions TO academy_interview_definer;
GRANT SELECT, INSERT ON interview.messages TO academy_interview_definer;
GRANT SELECT, INSERT, UPDATE ON interview.rate_limits TO academy_interview_definer;
GRANT SELECT (id, role, banned) ON identity."user" TO academy_interview_definer;
GRANT SELECT (user_id, token, expires_at, impersonated_by) ON identity.session TO academy_interview_definer;
GRANT SELECT ON knowledge.concepts, knowledge.lesson_concepts TO academy_interview_definer;
GRANT SELECT (id, slug, withdrawn_at) ON public.courses TO academy_interview_definer;
GRANT SELECT (id, course_id, revision, published_at) ON public.course_versions TO academy_interview_definer;
GRANT SELECT (version_id, locale) ON public.course_translations TO academy_interview_definer;
GRANT SELECT (version_id, document) ON authoring.snapshots TO academy_interview_definer;
GRANT SELECT (student_id, course_id, version_id) ON learning.enrollments TO academy_interview_definer;
--> statement-breakpoint
CREATE FUNCTION interview.student(actor_token text) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $actor$
DECLARE actor text;
BEGIN
  SELECT u.id INTO actor FROM identity."user" u JOIN identity.session s ON s.user_id = u.id
  WHERE s.token = actor_token AND s.expires_at > statement_timestamp() AND s.impersonated_by IS NULL
    AND NOT u.banned AND u.role = 'STUDENT';
  IF NOT FOUND THEN RAISE EXCEPTION 'Student access denied' USING ERRCODE = '42501'; END IF;
  RETURN actor;
END;
$actor$;
--> statement-breakpoint
CREATE FUNCTION interview.track_for(track_key knowledge.track) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $track$
  SELECT CASE track_key::text WHEN 'linux-os' THEN 'linux' WHEN 'git-ci' THEN 'git-cicd' ELSE track_key::text END;
$track$;
--> statement-breakpoint
CREATE FUNCTION interview.curriculum(session_row interview.sessions) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog AS $grounding$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'track', interview.track_for(c.track_slug), 'slug', c.slug,
    'title', CASE session_row.locale WHEN 'ar' THEN c.title_ar ELSE c.title_en END,
    'summary', CASE session_row.locale WHEN 'ar' THEN c.summary_ar ELSE c.summary_en END,
    'extract', extract.text
  ) ORDER BY c.slug), '[]'::jsonb)
  FROM knowledge.concepts c
  LEFT JOIN LATERAL (
    SELECT left(string_agg(left(b.block->'translations'->>session_row.locale::text, 360), E'\n' ORDER BY b.position), 520) AS text
    FROM (
      SELECT l.lesson FROM knowledge.lesson_concepts m
      JOIN public.courses course ON course.slug = m.course_slug
      LEFT JOIN learning.enrollments e ON e.course_id = course.id AND e.student_id = session_row.user_id
      JOIN LATERAL (
        SELECT v.id FROM public.course_versions v WHERE v.course_id = course.id
          AND v.published_at <= statement_timestamp()
          AND (v.id = e.version_id OR (e.version_id IS NULL AND course.withdrawn_at IS NULL))
        ORDER BY v.revision DESC LIMIT 1
      ) version ON true
      JOIN public.course_translations t ON t.version_id = version.id AND t.locale = session_row.locale
      JOIN authoring.snapshots s ON s.version_id = version.id
      CROSS JOIN LATERAL jsonb_array_elements(s.document->'modules') WITH ORDINALITY m2(module, position)
      CROSS JOIN LATERAL jsonb_array_elements(m2.module->'lessons') WITH ORDINALITY l(lesson, position)
      WHERE m.concept_id = c.id AND l.lesson->>'id' = m.lesson_id::text
      ORDER BY course.slug, m2.position, l.position LIMIT 1
    ) mapped
    CROSS JOIN LATERAL jsonb_array_elements(mapped.lesson->'blocks') WITH ORDINALITY b(block, position)
    WHERE b.block->>'type' IN ('paragraph', 'callout', 'markdown', 'code') AND b.position <= 8
  ) extract ON true
  WHERE interview.track_for(c.track_slug) = ANY(session_row.tracks);
$grounding$;
--> statement-breakpoint
CREATE FUNCTION interview.session_view(session_row interview.sessions, include_messages boolean) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog AS $projection$
  SELECT jsonb_build_object(
    'id', session_row.id, 'role', session_row.role, 'seniority', session_row.seniority, 'tracks', session_row.tracks,
    'locale', session_row.locale, 'turns', session_row.turns, 'inputReserved', session_row.input_reserved,
    'outputReserved', session_row.output_reserved, 'createdAt', session_row.created_at, 'completedAt', session_row.completed_at,
    'scorecard', CASE WHEN include_messages THEN session_row.scorecard_json END,
    'messages', CASE WHEN include_messages THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('speaker', m.speaker, 'text', m.body) ORDER BY m.position)
      FROM interview.messages m WHERE m.session_id = session_row.id
    ), '[]'::jsonb) END
  );
$projection$;
--> statement-breakpoint
CREATE FUNCTION interview.student_command(actor_token text, operation text, target_id uuid, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $command$
DECLARE
  actor text := interview.student(actor_token);
  session_row interview.sessions%ROWTYPE;
  action text := payload->>'action';
  requested_tracks text[];
  candidate_score jsonb := payload->'scorecard';
  input_cap integer := 8192;
  output_cap integer := 768;
  next_position integer;
  evaluation_reserve integer := 1536;
  command_time timestamptz := statement_timestamp();
BEGIN
  IF operation = 'history' THEN
    IF target_id IS NOT NULL THEN
      SELECT s.* INTO session_row FROM interview.sessions s WHERE s.id = target_id AND s.user_id = actor;
      IF NOT FOUND THEN RAISE EXCEPTION 'Interview unavailable' USING ERRCODE = 'P0404'; END IF;
    END IF;
    RETURN (SELECT coalesce(jsonb_agg(interview.session_view(s, false) ORDER BY s.created_at DESC, s.id DESC), '[]'::jsonb)
      FROM (SELECT s.* FROM interview.sessions s WHERE s.user_id = actor
        AND (target_id IS NULL OR (s.created_at, s.id) < (session_row.created_at, session_row.id))
        AND EXISTS (SELECT FROM interview.messages m WHERE m.session_id = s.id AND m.position = 0)
        ORDER BY s.created_at DESC, s.id DESC LIMIT 20) s);
  END IF;

  IF operation = 'begin' AND action = 'start' THEN
    SELECT array_agg(DISTINCT track ORDER BY track) INTO requested_tracks FROM jsonb_array_elements_text(payload->'tracks') AS t(track);
    IF target_id IS NOT NULL OR requested_tracks IS NULL OR array_position(requested_tracks, NULL) IS NOT NULL
      OR cardinality(requested_tracks) <> jsonb_array_length(payload->'tracks') THEN
      RAISE EXCEPTION 'Invalid interview setup' USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT s.* INTO session_row FROM interview.sessions s WHERE s.id = target_id AND s.user_id = actor FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Interview unavailable' USING ERRCODE = 'P0404'; END IF;
  END IF;

  IF operation = 'read' THEN
    IF NOT EXISTS (SELECT FROM interview.messages m WHERE m.session_id = target_id AND m.position = 0) THEN
      RAISE EXCEPTION 'Interview unavailable' USING ERRCODE = 'P0404';
    END IF;
    RETURN interview.session_view(session_row, true);
  END IF;

  IF operation IN ('finish', 'release') THEN
    IF session_row.lease_id IS NULL OR session_row.lease_id IS DISTINCT FROM (payload->>'lease')::uuid
      OR session_row.lease_until <= command_time THEN
      RAISE EXCEPTION 'Interview request expired' USING ERRCODE = '40001';
    END IF;
    IF operation = 'release' AND session_row.lease_operation = 'start' THEN
      DELETE FROM interview.sessions s WHERE s.id = target_id;
      RETURN NULL;
    ELSIF operation = 'finish' THEN
      CASE session_row.lease_operation
        WHEN 'start' THEN
          INSERT INTO interview.messages (session_id, position, speaker, body)
          VALUES (target_id, 0, 'interviewer', payload->>'question');
        WHEN 'message' THEN
          next_position := session_row.turns * 2 + 1;
          IF octet_length(payload->>'answer') > 2400 THEN
            RAISE EXCEPTION 'Answer too large' USING ERRCODE = '22023';
          END IF;
          INSERT INTO interview.messages (session_id, position, speaker, body)
          VALUES (target_id, next_position, 'learner', payload->>'answer');
          IF session_row.turns < 3 THEN
            INSERT INTO interview.messages (session_id, position, speaker, body)
            VALUES (target_id, next_position + 1, 'interviewer', payload->>'question');
          END IF;
          session_row.turns := session_row.turns + 1;
        WHEN 'evaluate' THEN
          IF jsonb_typeof(candidate_score) IS DISTINCT FROM 'object'
            OR jsonb_typeof(candidate_score->'overall_score') IS DISTINCT FROM 'number'
            OR (candidate_score->>'overall_score')::numeric NOT BETWEEN 0 AND 100
            OR jsonb_typeof(candidate_score->'weak_concept_slugs') IS DISTINCT FROM 'array'
            OR EXISTS (
              SELECT FROM jsonb_array_elements_text(candidate_score->'weak_concept_slugs') AS weak(slug)
              WHERE NOT EXISTS (SELECT FROM knowledge.concepts c WHERE c.slug = weak.slug
                AND interview.track_for(c.track_slug) = ANY(session_row.tracks))
            ) THEN
            RAISE EXCEPTION 'Invalid scorecard evidence' USING ERRCODE = '22023';
          END IF;
          session_row.scorecard_json := candidate_score;
          session_row.completed_at := command_time;
      END CASE;
    END IF;

    UPDATE interview.sessions s SET lease_id = NULL, lease_until = NULL, lease_operation = NULL,
      turns = session_row.turns, scorecard_json = session_row.scorecard_json, completed_at = session_row.completed_at
      WHERE s.id = target_id RETURNING s.* INTO session_row;
    RETURN interview.session_view(session_row, true);
  END IF;

  IF operation IS DISTINCT FROM 'begin' OR action IS NULL OR action NOT IN ('start', 'message', 'evaluate') THEN
    RAISE EXCEPTION 'Invalid interview operation' USING ERRCODE = '22023';
  END IF;

  IF action <> 'start' THEN
    IF session_row.lease_until > command_time OR session_row.completed_at IS NOT NULL
      OR NOT EXISTS (SELECT FROM interview.messages m WHERE m.session_id = target_id AND m.position = 0)
      OR session_row.turns IS DISTINCT FROM (payload->>'turn')::integer
      OR (action = 'message' AND session_row.turns >= 4)
      OR (action = 'evaluate' AND session_row.turns = 0) THEN
      RAISE EXCEPTION 'Interview state changed' USING ERRCODE = '40001';
    END IF;
    IF action = 'evaluate' THEN
      output_cap := evaluation_reserve;
    ELSIF session_row.turns = 3 THEN
      input_cap := 0;
      output_cap := 0;
    END IF;
    IF session_row.input_reserved + input_cap + (CASE WHEN action = 'message' AND input_cap > 0 THEN 8192 ELSE 0 END) > 65536
      OR session_row.output_reserved + output_cap + (CASE WHEN action = 'message' AND output_cap > 0 THEN evaluation_reserve ELSE 0 END) > 6144 THEN
      RAISE EXCEPTION 'Interview token budget exhausted' USING ERRCODE = 'P0422';
    END IF;
  END IF;

  INSERT INTO interview.rate_limits AS r (user_id, window_started, requests) VALUES (actor, command_time, 1)
  ON CONFLICT (user_id) DO UPDATE SET
    window_started = CASE WHEN r.window_started <= command_time - interval '1 minute' THEN command_time ELSE r.window_started END,
    requests = CASE WHEN r.window_started <= command_time - interval '1 minute' THEN 1 ELSE r.requests + 1 END
  WHERE r.window_started <= command_time - interval '1 minute' OR r.requests < 12;
  IF NOT FOUND THEN RAISE EXCEPTION 'Interview rate exceeded' USING ERRCODE = 'P0429'; END IF;

  IF action = 'start' THEN
    -- Discard expired opening reservations which never produced a transcript.
    DELETE FROM interview.sessions s WHERE s.user_id = actor AND s.lease_operation = 'start' AND s.lease_until <= command_time;
    INSERT INTO interview.sessions (user_id, role, seniority, tracks, locale)
    VALUES (actor, payload->>'role', payload->>'seniority', requested_tracks, (payload->>'locale')::public.course_locale)
    RETURNING * INTO session_row;
  END IF;

  UPDATE interview.sessions s SET lease_id = gen_random_uuid(), lease_until = command_time + interval '35 seconds',
    lease_operation = action, input_reserved = s.input_reserved + input_cap, output_reserved = s.output_reserved + output_cap
    WHERE s.id = session_row.id RETURNING s.* INTO session_row;
  RETURN jsonb_build_object('session', interview.session_view(session_row, true),
    'lease', session_row.lease_id, 'inputCap', input_cap, 'outputCap', output_cap,
    'sources', CASE WHEN input_cap > 0 THEN interview.curriculum(session_row) ELSE '[]'::jsonb END);
END;
$command$;
--> statement-breakpoint
CREATE FUNCTION interview.mastery_evidence(actor_token text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $mastery$
DECLARE actor text := interview.student(actor_token);
BEGIN
  RETURN (
    WITH latest AS (
      SELECT DISTINCT ON (c.slug) c.slug, s.scorecard_json
      FROM interview.sessions s
      JOIN knowledge.concepts c ON interview.track_for(c.track_slug) = ANY(s.tracks)
      WHERE s.user_id = actor AND s.completed_at IS NOT NULL
      ORDER BY c.slug, s.completed_at DESC, s.id DESC
    )
    SELECT coalesce(jsonb_object_agg(slug, (scorecard_json->>'overall_score')::numeric), '{}'::jsonb)
    FROM latest WHERE (scorecard_json->'weak_concept_slugs') ? slug
  );
END;
$mastery$;
--> statement-breakpoint
ALTER FUNCTION interview.student(text) OWNER TO academy_interview_definer;
ALTER FUNCTION interview.track_for(knowledge.track) OWNER TO academy_interview_definer;
ALTER FUNCTION interview.curriculum(interview.sessions) OWNER TO academy_interview_definer;
ALTER FUNCTION interview.session_view(interview.sessions,boolean) OWNER TO academy_interview_definer;
ALTER FUNCTION interview.student_command(text,text,uuid,jsonb) OWNER TO academy_interview_definer;
ALTER FUNCTION interview.mastery_evidence(text) OWNER TO academy_interview_definer;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA interview FROM PUBLIC;
GRANT EXECUTE ON FUNCTION interview.student_command(text,text,uuid,jsonb), interview.mastery_evidence(text) TO academy_learner_runtime;
