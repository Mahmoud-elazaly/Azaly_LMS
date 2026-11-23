CREATE SCHEMA "real_lab";
--> statement-breakpoint
CREATE TABLE "real_lab"."attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" text NOT NULL,
	"session_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"template_version" text DEFAULT 'nginx-reverse-proxy@1' NOT NULL,
	"state" text DEFAULT 'QUEUED' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ready_at" timestamp with time zone,
	"destroyed_at" timestamp with time zone,
	"end_reason" text,
	"lease_id" uuid,
	"lease_until" timestamp with time zone,
	"validate_after" timestamp with time zone,
	CONSTRAINT "real_lab_launch_retry" UNIQUE("learner_id","session_id","request_id"),
	CONSTRAINT "real_lab_template" CHECK ("real_lab"."attempts"."template_version" = 'nginx-reverse-proxy@1'),
	CONSTRAINT "real_lab_states" CHECK ("real_lab"."attempts"."state" IN ('QUEUED','PROVISIONING','READY','RUNNING','VALIDATING','FAILED','PASSED','STOPPING','CLEANUP_FAILED','DESTROYED')),
	CONSTRAINT "real_lab_end_reasons" CHECK ("real_lab"."attempts"."end_reason" IN ('STOPPED','RESET','EXPIRED','CANCELLED','PROVISION_FAILED','INSTANCE_LOST'))
);
--> statement-breakpoint
CREATE TABLE "real_lab"."checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"template_version" text NOT NULL,
	"checker_version" text NOT NULL,
	"configuration_ok" boolean NOT NULL,
	"response_ok" boolean NOT NULL,
	"completion_provenance" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "real_lab_checker_versions" CHECK ("real_lab"."checks"."template_version" = 'nginx-reverse-proxy@1' AND "real_lab"."checks"."checker_version" = 'nginx-route@1'),
	CONSTRAINT "real_lab_system_verification" CHECK (CASE WHEN "real_lab"."checks"."configuration_ok" AND "real_lab"."checks"."response_ok"
    THEN "real_lab"."checks"."completion_provenance" IS NOT DISTINCT FROM 'SYSTEM_VERIFIED'
    ELSE "real_lab"."checks"."completion_provenance" IS NULL END)
);
--> statement-breakpoint
CREATE TABLE "real_lab"."grants" (
	"digest" text PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	CONSTRAINT "real_lab_grant_operations" CHECK ("real_lab"."grants"."operation" IN ('config','apply','preview'))
);
--> statement-breakpoint
ALTER TABLE "real_lab"."attempts" ADD CONSTRAINT "attempts_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "identity"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_lab"."checks" ADD CONSTRAINT "checks_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "real_lab"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_lab"."grants" ADD CONSTRAINT "grants_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "real_lab"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "real_lab_one_active_learner" ON "real_lab"."attempts" USING btree ("learner_id") WHERE "real_lab"."attempts"."state" <> 'DESTROYED';--> statement-breakpoint
CREATE INDEX "real_lab_attempts_by_learner" ON "real_lab"."attempts" USING btree ("learner_id","requested_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "real_lab_checks_by_attempt" ON "real_lab"."checks" USING btree ("attempt_id","checked_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "real_lab_grants_by_attempt" ON "real_lab"."grants" USING btree ("attempt_id","issued_at");
--> statement-breakpoint
REVOKE ALL ON SCHEMA real_lab FROM PUBLIC;
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'academy_real_lab_runtime') THEN
    CREATE ROLE academy_real_lab_runtime NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'academy_real_lab_definer') THEN
    CREATE ROLE academy_real_lab_definer NOLOGIN;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname IN ('academy_real_lab_runtime', 'academy_real_lab_definer')
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Unexpected lab role privileges';
  END IF;
END;
$roles$;
--> statement-breakpoint
CREATE FUNCTION real_lab.live_session(session_key text, learner_key text) RETURNS boolean
LANGUAGE sql VOLATILE SET search_path = pg_catalog AS $live$
  SELECT EXISTS (
    SELECT FROM identity.session s JOIN identity."user" u ON u.id = s.user_id
    WHERE s.id = session_key AND u.id = learner_key AND s.expires_at > clock_timestamp()
      AND s.impersonated_by IS NULL AND u.role = 'STUDENT' AND NOT u.banned
  );
$live$;

CREATE FUNCTION real_lab.attempt_view(attempt real_lab.attempts) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog AS $view$
  SELECT jsonb_build_object(
    'id', attempt.id, 'state', attempt.state, 'endReason', attempt.end_reason, 'expiresAt', attempt.expires_at,
    'templateVersion', attempt.template_version,
    'check', (SELECT jsonb_build_object(
      'configurationOk', c.configuration_ok, 'responseOk', c.response_ok,
      'completionProvenance', c.completion_provenance, 'checkedAt', c.checked_at
    ) FROM real_lab.checks c WHERE c.attempt_id = attempt.id ORDER BY c.checked_at DESC, c.id LIMIT 1)
  );
$view$;

CREATE FUNCTION real_lab.student(actor_token text, operation text, attempt_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $student$
DECLARE
  learner_key text;
  session_key text;
  attempt real_lab.attempts%ROWTYPE;
  grant_token text;
BEGIN
  SELECT u.id, s.id INTO learner_key, session_key
    FROM identity.session s JOIN identity."user" u ON u.id = s.user_id
    WHERE s.token = actor_token AND s.expires_at > clock_timestamp()
      AND s.impersonated_by IS NULL AND u.role = 'STUDENT' AND NOT u.banned
    FOR SHARE OF s, u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lab access denied' USING ERRCODE = '42501'; END IF;

  IF operation = 'get' THEN
    SELECT * INTO attempt FROM real_lab.attempts a WHERE a.learner_id = learner_key AND a.session_id = session_key
      ORDER BY (a.state = 'DESTROYED'), a.requested_at DESC, a.id LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN real_lab.attempt_view(attempt);
  END IF;

  IF attempt_key IS NULL THEN RAISE EXCEPTION 'Lab ID is required' USING ERRCODE = '22023'; END IF;
  IF operation = 'start' THEN
    PERFORM pg_advisory_xact_lock(1861653101, 7);
    SELECT * INTO attempt FROM real_lab.attempts a
      WHERE a.learner_id = learner_key AND a.session_id = session_key AND a.request_id = attempt_key;
    IF FOUND THEN RETURN real_lab.attempt_view(attempt); END IF;

    IF EXISTS (SELECT FROM real_lab.attempts a WHERE a.learner_id = learner_key AND a.state <> 'DESTROYED') THEN
      RAISE EXCEPTION 'A lab already exists for this learner' USING ERRCODE = '23505';
    END IF;
    IF (SELECT count(*) FROM real_lab.attempts a WHERE a.state <> 'DESTROYED') >= 4 OR
       (SELECT count(*) FROM real_lab.attempts a WHERE a.learner_id = learner_key
         AND a.requested_at > clock_timestamp() - interval '1 hour') >= 6 THEN
      RAISE EXCEPTION 'Lab quota reached' USING ERRCODE = '54000';
    END IF;
    INSERT INTO real_lab.attempts (learner_id, session_id, request_id, expires_at)
      VALUES (learner_key, session_key, attempt_key, clock_timestamp() + interval '15 minutes')
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
CREATE FUNCTION real_lab.consume(grant_token text) RETURNS jsonb
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
  RETURN jsonb_build_object('id', attempt.id, 'operation', grant_entry.operation);
END;
$consume$;

CREATE FUNCTION real_lab.claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $claim$
DECLARE
  attempt real_lab.attempts%ROWTYPE;
  operation text;
BEGIN
  DELETE FROM real_lab.grants WHERE expires_at < clock_timestamp() - interval '1 minute';
  UPDATE real_lab.attempts a SET state = 'STOPPING', lease_id = NULL, lease_until = NULL,
    end_reason = CASE WHEN a.expires_at <= clock_timestamp() THEN 'EXPIRED' ELSE 'CANCELLED' END
    WHERE a.state NOT IN ('STOPPING','CLEANUP_FAILED','DESTROYED') AND
      (a.expires_at <= clock_timestamp() OR NOT real_lab.live_session(a.session_id, a.learner_id));

  SELECT * INTO attempt FROM real_lab.attempts a
    WHERE a.state IN ('QUEUED','PROVISIONING','VALIDATING','STOPPING','CLEANUP_FAILED')
      AND (a.lease_until IS NULL OR a.lease_until <= clock_timestamp())
    ORDER BY (a.state IN ('STOPPING','CLEANUP_FAILED')) DESC, a.requested_at, a.id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;

  operation := CASE attempt.state WHEN 'VALIDATING' THEN 'check'
    WHEN 'STOPPING' THEN 'destroy' WHEN 'CLEANUP_FAILED' THEN 'destroy' ELSE 'provision' END;
  UPDATE real_lab.attempts SET state = CASE operation WHEN 'provision' THEN 'PROVISIONING'
      WHEN 'destroy' THEN 'STOPPING' ELSE 'VALIDATING' END,
    lease_id = gen_random_uuid(), lease_until = clock_timestamp() + interval '45 seconds'
    WHERE id = attempt.id RETURNING * INTO attempt;
  RETURN jsonb_build_object('id', attempt.id, 'lease', attempt.lease_id,
    'operation', operation, 'expiresAt', attempt.expires_at, 'templateVersion', attempt.template_version);
END;
$claim$;

CREATE FUNCTION real_lab.finish(attempt_key uuid, lease_key uuid, gateway_ok boolean, route_ok boolean, response_ok boolean,
  checker_version text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $finish$
DECLARE
  attempt real_lab.attempts%ROWTYPE;
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
      IF checker_version IS DISTINCT FROM 'nginx-route@1' OR route_ok IS NULL OR response_ok IS NULL THEN
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

CREATE FUNCTION real_lab.reconcile(inventory uuid[]) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $reconcile$
BEGIN
  UPDATE real_lab.attempts a SET state = 'STOPPING', end_reason = 'INSTANCE_LOST', lease_id = NULL, lease_until = NULL
    WHERE a.state IN ('READY','RUNNING','FAILED','PASSED') AND NOT (a.id = ANY(inventory));
  RETURN ARRAY(SELECT id FROM unnest(inventory) AS instance(id)
    WHERE NOT EXISTS (SELECT FROM real_lab.attempts a WHERE a.id = instance.id AND a.state <> 'DESTROYED'));
END;
$reconcile$;
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA real_lab FROM PUBLIC;
GRANT USAGE ON SCHEMA real_lab TO academy_learner_runtime, academy_real_lab_runtime, academy_real_lab_definer;
GRANT EXECUTE ON FUNCTION real_lab.student(text, text, uuid) TO academy_learner_runtime;
GRANT EXECUTE ON FUNCTION real_lab.claim(), real_lab.consume(text), real_lab.reconcile(uuid[]),
  real_lab.finish(uuid, uuid, boolean, boolean, boolean, text) TO academy_real_lab_runtime;
GRANT USAGE ON SCHEMA identity TO academy_real_lab_definer;
GRANT SELECT (id, role, banned), UPDATE (updated_at) ON identity."user" TO academy_real_lab_definer;
GRANT SELECT (id, user_id, token, expires_at, impersonated_by), UPDATE (expires_at)
  ON identity.session TO academy_real_lab_definer;
GRANT SELECT, INSERT, UPDATE ON real_lab.attempts TO academy_real_lab_definer;
GRANT SELECT, INSERT, UPDATE, DELETE ON real_lab.grants TO academy_real_lab_definer;
GRANT SELECT, INSERT ON real_lab.checks TO academy_real_lab_definer;
GRANT CREATE ON SCHEMA real_lab TO academy_real_lab_definer;
ALTER FUNCTION real_lab.live_session(text, text) OWNER TO academy_real_lab_definer;
ALTER FUNCTION real_lab.attempt_view(real_lab.attempts) OWNER TO academy_real_lab_definer;
ALTER FUNCTION real_lab.student(text, text, uuid) OWNER TO academy_real_lab_definer;
ALTER FUNCTION real_lab.claim() OWNER TO academy_real_lab_definer;
ALTER FUNCTION real_lab.finish(uuid, uuid, boolean, boolean, boolean, text) OWNER TO academy_real_lab_definer;
ALTER FUNCTION real_lab.consume(text) OWNER TO academy_real_lab_definer;
ALTER FUNCTION real_lab.reconcile(uuid[]) OWNER TO academy_real_lab_definer;
REVOKE CREATE ON SCHEMA real_lab FROM academy_real_lab_definer;
