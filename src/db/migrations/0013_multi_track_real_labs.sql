ALTER TABLE "real_lab"."attempts" DROP CONSTRAINT "real_lab_template";--> statement-breakpoint
ALTER TABLE "real_lab"."checks" DROP CONSTRAINT "real_lab_checker_versions";--> statement-breakpoint
ALTER TABLE "knowledge"."lab_concepts" DROP CONSTRAINT "lab_concepts_kind";--> statement-breakpoint
ALTER TABLE "real_lab"."attempts" ADD CONSTRAINT "real_lab_template" CHECK ("real_lab"."attempts"."template_version" IN ('nginx-reverse-proxy@1','linux-file-permissions@1','prometheus-exposition@1'));--> statement-breakpoint
ALTER TABLE "real_lab"."checks" ADD CONSTRAINT "real_lab_checker_versions" CHECK (("real_lab"."checks"."template_version", "real_lab"."checks"."checker_version") IN (
    ('nginx-reverse-proxy@1','nginx-route@1'),
    ('linux-file-permissions@1','linux-umask@1'),
    ('prometheus-exposition@1','prometheus-exposition@1')));--> statement-breakpoint
ALTER TABLE "knowledge"."lab_concepts" ADD CONSTRAINT "lab_concepts_kind" CHECK (("knowledge"."lab_concepts"."course_slug" IS NOT NULL AND "knowledge"."lab_concepts"."lab_id" IS NOT NULL AND "knowledge"."lab_concepts"."real_template_version" IS NULL)
    OR ("knowledge"."lab_concepts"."course_slug" IS NULL AND "knowledge"."lab_concepts"."lab_id" IS NULL AND "knowledge"."lab_concepts"."real_template_version" IN ('nginx-reverse-proxy@1','linux-file-permissions@1','prometheus-exposition@1')
      AND "knowledge"."lab_concepts"."real_template_version" IS NOT NULL));
--> statement-breakpoint
CREATE FUNCTION real_lab.student(actor_token text, operation text, attempt_key uuid, requested_template text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $student$
DECLARE
  learner_key text;
  session_key text;
  attempt real_lab.attempts%ROWTYPE;
  grant_token text;
  chosen_template text;
BEGIN
  SELECT u.id, s.id INTO learner_key, session_key
    FROM identity.session s JOIN identity."user" u ON u.id = s.user_id
    WHERE s.token = actor_token AND s.expires_at > clock_timestamp()
      AND s.impersonated_by IS NULL AND u.role = 'STUDENT' AND NOT u.banned
    FOR SHARE OF s, u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lab access denied' USING ERRCODE = '42501'; END IF;

  IF requested_template IS NOT NULL AND operation IS DISTINCT FROM 'start' THEN
    RAISE EXCEPTION 'Lab template only applies to start' USING ERRCODE = '22023';
  END IF;

  IF operation = 'get' THEN
    SELECT * INTO attempt FROM real_lab.attempts a WHERE a.learner_id = learner_key AND a.session_id = session_key
      ORDER BY (a.state = 'DESTROYED'), a.requested_at DESC, a.id LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN real_lab.attempt_view(attempt);
  END IF;

  IF attempt_key IS NULL THEN RAISE EXCEPTION 'Lab ID is required' USING ERRCODE = '22023'; END IF;
  IF operation = 'start' THEN
    chosen_template := coalesce(requested_template, 'nginx-reverse-proxy@1');
    IF chosen_template NOT IN ('nginx-reverse-proxy@1','linux-file-permissions@1','prometheus-exposition@1') THEN
      RAISE EXCEPTION 'Unknown lab template' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(1861653101, 7);
    SELECT * INTO attempt FROM real_lab.attempts a
      WHERE a.learner_id = learner_key AND a.session_id = session_key AND a.request_id = attempt_key;
    IF FOUND THEN
      IF attempt.template_version <> chosen_template THEN
        RAISE EXCEPTION 'Lab request already used for a different template' USING ERRCODE = '40001';
      END IF;
      RETURN real_lab.attempt_view(attempt);
    END IF;

    IF EXISTS (SELECT FROM real_lab.attempts a WHERE a.learner_id = learner_key AND a.state <> 'DESTROYED') THEN
      RAISE EXCEPTION 'A lab already exists for this learner' USING ERRCODE = '23505';
    END IF;
    IF (SELECT count(*) FROM real_lab.attempts a WHERE a.state <> 'DESTROYED') >= 4 OR
       (SELECT count(*) FROM real_lab.attempts a WHERE a.learner_id = learner_key
         AND a.requested_at > clock_timestamp() - interval '1 hour') >= 6 THEN
      RAISE EXCEPTION 'Lab quota reached' USING ERRCODE = '54000';
    END IF;
    INSERT INTO real_lab.attempts (learner_id, session_id, request_id, template_version, expires_at)
      VALUES (learner_key, session_key, attempt_key, chosen_template, clock_timestamp() + interval '15 minutes')
      RETURNING * INTO attempt;
    RETURN real_lab.attempt_view(attempt);
  END IF;

  SELECT * INTO attempt FROM real_lab.attempts a
    WHERE a.id = attempt_key AND a.learner_id = learner_key AND a.session_id = session_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lab attempt unavailable' USING ERRCODE = '42501'; END IF;

  IF operation IN ('stop','reset') THEN
    IF attempt.state NOT IN ('STOPPING','CLEANUP_FAILED','DESTROYED') THEN
      UPDATE real_lab.attempts SET state = 'STOPPING', end_reason = CASE operation WHEN 'reset' THEN 'RESET' ELSE 'STOPPED' END,
        lease_id = NULL, lease_until = NULL WHERE id = attempt.id RETURNING * INTO attempt;
    END IF;
    RETURN real_lab.attempt_view(attempt);
  END IF;

  IF attempt.expires_at <= clock_timestamp() OR attempt.state NOT IN ('READY','RUNNING','FAILED','PASSED') THEN
    RAISE EXCEPTION 'Lab attempt is inactive' USING ERRCODE = '40001';
  END IF;

  IF operation = 'validate' THEN
    IF attempt.state = 'PASSED' THEN RETURN real_lab.attempt_view(attempt); END IF;
    IF attempt.validate_after > clock_timestamp() THEN RAISE EXCEPTION 'Lab check rate exceeded' USING ERRCODE = '54000'; END IF;
    UPDATE real_lab.attempts SET state = 'VALIDATING', validate_after = clock_timestamp() + interval '2 seconds'
      WHERE id = attempt.id RETURNING * INTO attempt;
    RETURN real_lab.attempt_view(attempt);
  END IF;

  IF operation NOT IN ('config','apply','preview') OR operation IS NULL THEN
    RAISE EXCEPTION 'Unknown lab operation' USING ERRCODE = '22023';
  END IF;
  IF operation = 'apply' AND attempt.state = 'PASSED' THEN
    RAISE EXCEPTION 'Verified configuration is fixed' USING ERRCODE = '40001';
  END IF;
  IF (SELECT count(*) FROM real_lab.grants g WHERE g.attempt_id = attempt.id
       AND g.issued_at > clock_timestamp() - interval '30 seconds') >= 20 THEN
    RAISE EXCEPTION 'Lab gateway rate exceeded' USING ERRCODE = '54000';
  END IF;
  grant_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO real_lab.grants (digest, attempt_id, operation, expires_at) VALUES (
    encode(sha256(convert_to(grant_token, 'UTF8')), 'hex'), attempt.id, operation,
    least(attempt.expires_at, clock_timestamp() + interval '10 seconds')
  );
  RETURN jsonb_build_object('grant', grant_token);
END;
$student$;
--> statement-breakpoint
GRANT CREATE ON SCHEMA real_lab TO academy_real_lab_definer;
ALTER FUNCTION real_lab.student(text, text, uuid, text) OWNER TO academy_real_lab_definer;
REVOKE CREATE ON SCHEMA real_lab FROM academy_real_lab_definer;
REVOKE ALL ON FUNCTION real_lab.student(text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION real_lab.student(text, text, uuid, text) TO academy_learner_runtime;

CREATE OR REPLACE FUNCTION real_lab.student(actor_token text, operation text, attempt_key uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $student$
  SELECT real_lab.student(actor_token, operation, attempt_key, NULL::text);
$student$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION real_lab.consume(grant_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $consume$
DECLARE
  grant_entry real_lab.grants%ROWTYPE;
  attempt real_lab.attempts%ROWTYPE;
BEGIN
  IF grant_token IS NULL OR grant_token !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO grant_entry FROM real_lab.grants g
    WHERE g.digest = encode(sha256(convert_to(grant_token, 'UTF8')), 'hex');
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO attempt FROM real_lab.attempts a WHERE a.id = grant_entry.attempt_id FOR UPDATE;
  IF attempt.expires_at <= clock_timestamp() OR attempt.state NOT IN ('READY','RUNNING','FAILED','PASSED')
    OR (grant_entry.operation = 'apply' AND attempt.state = 'PASSED') OR
    NOT real_lab.live_session(attempt.session_id, attempt.learner_id) THEN RETURN NULL; END IF;

  UPDATE real_lab.grants SET redeemed_at = clock_timestamp()
    WHERE digest = grant_entry.digest AND redeemed_at IS NULL AND expires_at > clock_timestamp();
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF attempt.state = 'READY' OR (grant_entry.operation = 'apply' AND attempt.state = 'FAILED') THEN
    UPDATE real_lab.attempts SET state = 'RUNNING' WHERE id = attempt.id;
  END IF;
  RETURN jsonb_build_object('id', attempt.id, 'operation', grant_entry.operation,
    'templateVersion', attempt.template_version);
END;
$consume$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION real_lab.finish(attempt_key uuid, lease_key uuid, gateway_ok boolean, route_ok boolean, response_ok boolean,
  checker_version text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $finish$
DECLARE
  attempt real_lab.attempts%ROWTYPE;
  expected_checker text;
BEGIN
  SELECT * INTO attempt FROM real_lab.attempts a WHERE a.id = attempt_key AND a.lease_id = lease_key
    AND a.lease_until > clock_timestamp() FOR UPDATE;
  IF NOT FOUND OR gateway_ok IS NULL THEN RETURN false; END IF;

  IF attempt.state = 'STOPPING' THEN
    UPDATE real_lab.attempts SET state = CASE WHEN gateway_ok THEN 'DESTROYED' ELSE 'CLEANUP_FAILED' END,
      destroyed_at = CASE WHEN gateway_ok THEN clock_timestamp() END,
      lease_id = NULL, lease_until = CASE WHEN NOT gateway_ok THEN clock_timestamp() + interval '5 seconds' END
      WHERE id = attempt.id;
  ELSIF attempt.expires_at <= clock_timestamp() OR NOT real_lab.live_session(attempt.session_id, attempt.learner_id) THEN
    UPDATE real_lab.attempts SET state = 'STOPPING', lease_id = NULL, lease_until = NULL,
      end_reason = CASE WHEN attempt.expires_at <= clock_timestamp() THEN 'EXPIRED' ELSE 'CANCELLED' END
      WHERE id = attempt.id;
    RETURN false;
  ELSIF attempt.state = 'PROVISIONING' THEN
    UPDATE real_lab.attempts SET state = CASE WHEN gateway_ok THEN 'READY' ELSE 'STOPPING' END,
      ready_at = CASE WHEN gateway_ok THEN clock_timestamp() END,
      end_reason = CASE WHEN NOT gateway_ok THEN 'PROVISION_FAILED' END,
      lease_id = NULL, lease_until = NULL WHERE id = attempt.id;
  ELSIF attempt.state = 'VALIDATING' THEN
    IF NOT gateway_ok THEN
      UPDATE real_lab.attempts SET state = 'STOPPING', end_reason = 'INSTANCE_LOST', lease_id = NULL, lease_until = NULL
        WHERE id = attempt.id;
    ELSE
      expected_checker := CASE attempt.template_version
        WHEN 'nginx-reverse-proxy@1' THEN 'nginx-route@1'
        WHEN 'linux-file-permissions@1' THEN 'linux-umask@1'
        WHEN 'prometheus-exposition@1' THEN 'prometheus-exposition@1'
      END;
      IF expected_checker IS NULL OR checker_version IS DISTINCT FROM expected_checker
        OR route_ok IS NULL OR response_ok IS NULL THEN
        RAISE EXCEPTION 'Invalid trusted check result' USING ERRCODE = '22023';
      END IF;
      INSERT INTO real_lab.checks (id, attempt_id, template_version, checker_version, configuration_ok, response_ok, completion_provenance)
        VALUES (lease_key, attempt.id, attempt.template_version, checker_version, route_ok, response_ok,
          CASE WHEN route_ok AND response_ok THEN 'SYSTEM_VERIFIED' END);
      UPDATE real_lab.attempts SET state = CASE WHEN route_ok AND response_ok THEN 'PASSED' ELSE 'FAILED' END,
        lease_id = NULL, lease_until = NULL WHERE id = attempt.id;
    END IF;
  ELSE RETURN false;
  END IF;
  RETURN true;
END;
$finish$;
--> statement-breakpoint
INSERT INTO knowledge.concepts (slug, track_slug, title_en, title_ar, summary_en, summary_ar) VALUES
  ('linux-file-permissions', 'linux-os', 'Linux File Permissions', 'أذونات ملفات لينكس',
   'Use a restrictive umask and check the permissions of newly created files.',
   'اضبط قناع أذونات مقيّدًا وتحقّق من أذونات الملفات الجديدة.'),
  ('prometheus-exposition', 'observability', 'Prometheus Metrics Exposition', 'عرض مقاييس Prometheus',
   'Inspect a live metrics endpoint and verify the counter type and label values.',
   'افحص نقطة مقاييس فعليّة وتحقّق من نوع العدّاد وقيم الوسوم.');

INSERT INTO knowledge.concept_edges (source_concept_id, target_concept_id, relation_type)
SELECT source.id, target.id, 'prerequisite'
FROM (VALUES ('linux-file-permissions','linux-networking'), ('prometheus','prometheus-exposition')) AS mapping(source, target)
JOIN knowledge.concepts source ON source.slug = mapping.source
JOIN knowledge.concepts target ON target.slug = mapping.target;

INSERT INTO knowledge.lab_concepts (real_template_version, concept_id)
SELECT mapping.template, concept.id
FROM (VALUES ('linux-file-permissions@1','linux-file-permissions'), ('prometheus-exposition@1', 'prometheus-exposition')) AS mapping(template, slug)
JOIN knowledge.concepts concept ON concept.slug = mapping.slug;
