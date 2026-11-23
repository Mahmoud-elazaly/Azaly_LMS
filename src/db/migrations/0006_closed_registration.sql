REVOKE INSERT ON identity."user" FROM academy_auth_runtime;
REVOKE INSERT (id, name, email, email_verified, image, created_at, updated_at)
  ON identity."user" FROM academy_auth_runtime;
REVOKE UPDATE (name) ON identity."user" FROM academy_auth_runtime;

ALTER TABLE identity.audit_event ADD COLUMN action text DEFAULT 'user.change' NOT NULL;
CREATE TABLE identity.invitation (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  role identity.user_role NOT NULL CHECK (role <> 'OWNER'),
  locale text NOT NULL CHECK (locale IN ('ar', 'en')),
  token_hash text UNIQUE,
  expires_at timestamptz NOT NULL,
  created_by text NOT NULL REFERENCES identity."user"(id),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((closed_at IS NULL) = (token_hash IS NOT NULL))
);
CREATE UNIQUE INDEX invitation_open_email_idx ON identity.invitation (email) WHERE closed_at IS NULL;
CREATE TABLE identity.account_rate_limit (
  bucket text PRIMARY KEY,
  attempts integer NOT NULL,
  resets_at timestamptz NOT NULL
);
CREATE INDEX account_rate_limit_resets_idx ON identity.account_rate_limit (resets_at);
--> statement-breakpoint
-- List metadata only. Token digests remain accessible solely through the functions below.
GRANT SELECT (id, name, email, role, locale, expires_at, closed_at, created_at)
  ON identity.invitation TO academy_auth_runtime;
--> statement-breakpoint
CREATE FUNCTION identity.consume_account_limit(p_bucket text, p_max integer, p_seconds integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $limit$
DECLARE
  allowed boolean;
BEGIN
  INSERT INTO identity.account_rate_limit (bucket, attempts, resets_at)
  VALUES (p_bucket, 1, now() + make_interval(secs => p_seconds))
  ON CONFLICT (bucket) DO UPDATE
    SET attempts = CASE WHEN account_rate_limit.resets_at <= now() THEN 1 ELSE account_rate_limit.attempts + 1 END,
        resets_at = CASE WHEN account_rate_limit.resets_at <= now() THEN excluded.resets_at ELSE account_rate_limit.resets_at END
    WHERE account_rate_limit.resets_at <= now() OR account_rate_limit.attempts < p_max
  RETURNING true INTO allowed;
  DELETE FROM identity.account_rate_limit
  WHERE bucket IN (
    SELECT bucket FROM identity.account_rate_limit WHERE resets_at <= now()
    ORDER BY resets_at LIMIT 32 FOR UPDATE SKIP LOCKED
  );
  RETURN coalesce(allowed, false);
END;
$limit$;
--> statement-breakpoint
CREATE FUNCTION identity.account_manager(p_token text)
RETURNS identity."user"
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog
AS $manager$
  SELECT u.* FROM identity."user" u
  JOIN identity.session s ON s.user_id = u.id
  WHERE s.token = p_token AND s.expires_at > now() AND s.impersonated_by IS NULL
    AND NOT u.banned AND u.role IN ('OWNER', 'ADMIN')
  FOR UPDATE OF s, u;
$manager$;
--> statement-breakpoint
CREATE FUNCTION identity.edit_user(
  p_token text, p_id text, p_name text, p_role identity.user_role
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $edit$
DECLARE
  actor identity."user";
  target identity."user";
  invitation identity.invitation;
BEGIN
  PERFORM pg_advisory_xact_lock(1861653101, 1);
  actor := identity.account_manager(p_token);
  IF actor.id IS NULL OR actor.id = p_id OR p_role IS NULL OR p_role = 'OWNER'
    OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120
    OR (actor.role = 'ADMIN' AND p_role = 'ADMIN') THEN
    RETURN false;
  END IF;

  SELECT * INTO target FROM identity."user" WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO invitation FROM identity.invitation WHERE id = p_id AND closed_at IS NULL FOR UPDATE;
    IF NOT FOUND OR (actor.role = 'ADMIN' AND invitation.role = 'ADMIN') THEN RETURN false; END IF;
    IF invitation.name = p_name AND invitation.role = p_role THEN RETURN true; END IF;
    UPDATE identity.invitation SET name = p_name, role = p_role WHERE id = p_id;
    INSERT INTO identity.audit_event (action, actor_id, target_id, previous_role, new_role)
      VALUES ('invitation.edit', actor.id, p_id, invitation.role, p_role);
    RETURN true;
  END IF;

  IF target.role = 'OWNER' OR (actor.role = 'ADMIN' AND target.role = 'ADMIN') THEN RETURN false; END IF;
  IF target.name = p_name AND target.role = p_role THEN RETURN true; END IF;
  UPDATE identity."user" SET name = p_name, role = p_role, updated_at = now() WHERE id = p_id;
  IF target.role <> p_role THEN DELETE FROM identity.session WHERE user_id = p_id; END IF;
  INSERT INTO identity.audit_event (action, actor_id, target_id, previous_role, new_role, previous_banned, new_banned)
    VALUES ('user.edit', actor.id, p_id, target.role, p_role, target.banned, target.banned);
  RETURN true;
END;
$edit$;
--> statement-breakpoint
CREATE FUNCTION identity.manage_invitation(
  p_token text, p_operation text, p_id text, p_name text, p_email text,
  p_role identity.user_role, p_locale text, p_hash text
) RETURNS TABLE (outcome text, recipient text, language text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $invitation$
DECLARE
  actor identity."user";
  entry identity.invitation;
BEGIN
  PERFORM pg_advisory_xact_lock(1861653101, 1);
  actor := identity.account_manager(p_token);
  IF actor.id IS NULL OR p_operation NOT IN ('invite', 'resend', 'revoke') THEN
    RETURN QUERY SELECT 'denied', NULL::text, NULL::text;
    RETURN;
  END IF;

  IF p_operation = 'invite' THEN
    IF p_role IS NULL OR p_role = 'OWNER' OR (p_role = 'ADMIN' AND actor.role <> 'OWNER') THEN
      RETURN QUERY SELECT 'denied', NULL::text, NULL::text;
      RETURN;
    END IF;
    IF EXISTS (SELECT 1 FROM identity."user" u WHERE lower(u.email) = p_email)
      OR EXISTS (SELECT 1 FROM identity.invitation i WHERE i.email = p_email AND i.closed_at IS NULL) THEN
      RETURN QUERY SELECT 'duplicate', NULL::text, NULL::text;
      RETURN;
    END IF;
    INSERT INTO identity.invitation (id, name, email, role, locale, token_hash, expires_at, created_by)
      VALUES (p_id, p_name, p_email, p_role, p_locale, p_hash, now() + interval '48 hours', actor.id)
      RETURNING * INTO entry;
  ELSE
    SELECT * INTO entry FROM identity.invitation WHERE id = p_id AND closed_at IS NULL FOR UPDATE;
    IF entry.id IS NULL OR (entry.role = 'ADMIN' AND actor.role <> 'OWNER') THEN
      RETURN QUERY SELECT 'denied', NULL::text, NULL::text;
      RETURN;
    END IF;
    IF p_operation = 'resend' THEN
      UPDATE identity.invitation SET token_hash = p_hash, expires_at = now() + interval '48 hours' WHERE id = p_id;
    ELSE
      UPDATE identity.invitation SET token_hash = NULL, closed_at = now() WHERE id = p_id;
    END IF;
  END IF;

  INSERT INTO identity.audit_event (action, actor_id, target_id, previous_role, new_role)
    VALUES ('invitation.' || p_operation, actor.id, entry.id, entry.role, entry.role);
  RETURN QUERY SELECT 'ok', entry.email, entry.locale;
END;
$invitation$;
--> statement-breakpoint
CREATE FUNCTION identity.activate_invitation(p_hash text, p_password text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $activate$
DECLARE
  entry identity.invitation;
BEGIN
  PERFORM pg_advisory_xact_lock(1861653101, 1);
  SELECT * INTO entry FROM identity.invitation
    WHERE token_hash = p_hash AND closed_at IS NULL AND expires_at > now() FOR UPDATE;
  IF entry.id IS NULL OR EXISTS (SELECT 1 FROM identity."user" u WHERE lower(u.email) = entry.email) THEN
    RETURN false;
  END IF;
  INSERT INTO identity."user" (id, name, email, email_verified, role)
    VALUES (entry.id, entry.name, entry.email, true, entry.role);
  INSERT INTO identity.account (id, account_id, provider_id, user_id, password)
    VALUES (gen_random_uuid()::text, entry.id, 'credential', entry.id, p_password);
  UPDATE identity.invitation SET token_hash = NULL, closed_at = now() WHERE id = entry.id;
  INSERT INTO identity.audit_event (action, actor_id, target_id, previous_role, new_role)
    VALUES ('invitation.activate', entry.id, entry.id, entry.role, entry.role);
  RETURN true;
END;
$activate$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION identity.account_manager(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.consume_account_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.edit_user(text, text, text, identity.user_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.manage_invitation(text, text, text, text, text, identity.user_role, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.activate_invitation(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.consume_account_limit(text, integer, integer),
  identity.edit_user(text, text, text, identity.user_role),
  identity.manage_invitation(text, text, text, text, text, identity.user_role, text, text),
  identity.activate_invitation(text, text) TO academy_auth_runtime;
