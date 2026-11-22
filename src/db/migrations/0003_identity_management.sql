ALTER TABLE identity.audit_event ADD COLUMN previous_banned boolean, ADD COLUMN new_banned boolean;
--> statement-breakpoint
CREATE FUNCTION identity.manage_user(actor_token text, target_id text, target_role identity.user_role, target_banned boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $manage$
DECLARE
  actor identity."user"%ROWTYPE;
  target identity."user"%ROWTYPE;
BEGIN
  -- Serialize privileged changes with one another and with Owner bootstrap.
  PERFORM pg_advisory_xact_lock(1861653101, 1);
  SELECT u.* INTO actor FROM identity."user" u
  JOIN identity.session s ON s.user_id = u.id
  WHERE s.token = actor_token AND s.expires_at > now() AND s.impersonated_by IS NULL AND NOT u.banned
  FOR UPDATE OF s, u;

  IF NOT FOUND OR actor.role NOT IN ('OWNER', 'ADMIN') OR actor.id = target_id THEN
    RETURN false;
  END IF;
  SELECT u.* INTO target FROM identity."user" u WHERE u.id = target_id FOR UPDATE;
  IF NOT FOUND OR target.role = 'OWNER' OR target_role = 'OWNER'
    OR (actor.role = 'ADMIN' AND (target.role = 'ADMIN' OR target_role = 'ADMIN')) THEN
    RETURN false;
  END IF;
  IF (target_role IS NULL) = (target_banned IS NULL) THEN
    RETURN false;
  END IF;
  IF coalesce(target_role, target.role) = target.role AND coalesce(target_banned, target.banned) = target.banned THEN
    RETURN true;
  END IF;

  UPDATE identity."user" SET role = coalesce(target_role, target.role),
    banned = coalesce(target_banned, target.banned), ban_reason = NULL, ban_expires = NULL, updated_at = now()
    WHERE id = target.id;
  DELETE FROM identity.session WHERE user_id = target.id;
  INSERT INTO identity.audit_event (actor_id, target_id, previous_role, new_role, previous_banned, new_banned)
    VALUES (actor.id, target.id, target.role, coalesce(target_role, target.role),
      target.banned, coalesce(target_banned, target.banned));
  RETURN true;
END;
$manage$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION identity.manage_user(text, text, identity.user_role, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.manage_user(text, text, identity.user_role, boolean) TO academy_auth_runtime;
