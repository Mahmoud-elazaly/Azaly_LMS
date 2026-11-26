DO $role$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'academy_identity_definer') THEN
    CREATE ROLE academy_identity_definer NOLOGIN;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'academy_identity_definer'
    AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Unexpected identity definer privileges';
  END IF;
END;
$role$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA identity TO academy_identity_definer;
GRANT SELECT ON identity."user" TO academy_identity_definer;
GRANT INSERT (id, name, email, email_verified, role),
  UPDATE (name, role, banned, ban_reason, ban_expires, updated_at)
  ON identity."user" TO academy_identity_definer;
GRANT SELECT (user_id, token, expires_at, impersonated_by), UPDATE (updated_at), DELETE
  ON identity.session TO academy_identity_definer;
GRANT INSERT (id, account_id, provider_id, user_id, password) ON identity.account TO academy_identity_definer;
GRANT INSERT (action, actor_id, target_id, previous_role, new_role, previous_banned, new_banned)
  ON identity.audit_event TO academy_identity_definer;
GRANT SELECT, INSERT ON identity.invitation TO academy_identity_definer;
GRANT UPDATE (name, role, token_hash, expires_at, closed_at) ON identity.invitation TO academy_identity_definer;
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.account_rate_limit TO academy_identity_definer;
--> statement-breakpoint
ALTER FUNCTION identity.account_manager(text) OWNER TO academy_identity_definer;
ALTER FUNCTION identity.activate_invitation(text, text) OWNER TO academy_identity_definer;
ALTER FUNCTION identity.consume_account_limit(text, integer, integer) OWNER TO academy_identity_definer;
ALTER FUNCTION identity.edit_user(text, text, text, identity.user_role) OWNER TO academy_identity_definer;
ALTER FUNCTION identity.manage_invitation(text, text, text, text, text, identity.user_role, text, text)
  OWNER TO academy_identity_definer;
ALTER FUNCTION identity.manage_user(text, text, identity.user_role, boolean) OWNER TO academy_identity_definer;
REVOKE ALL ON FUNCTION identity.account_manager(text), identity.activate_invitation(text, text),
  identity.consume_account_limit(text, integer, integer), identity.edit_user(text, text, text, identity.user_role),
  identity.manage_invitation(text, text, text, text, text, identity.user_role, text, text),
  identity.manage_user(text, text, identity.user_role, boolean) FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION identity.guard_user_privileges() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $guard$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Invitation activation is the scoped non-login path for staff provisioning.
    IF current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID))
      AND (NEW.role = 'OWNER' OR (current_user <> 'academy_identity_definer' AND NEW.role <> 'STUDENT')
        OR NEW.banned OR NEW.ban_reason IS NOT NULL OR NEW.ban_expires IS NOT NULL) THEN
      RAISE EXCEPTION 'Privileged identity fields cannot be set at registration' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.role = 'OWNER' AND NOT OLD.banned
    AND (TG_OP = 'DELETE' OR NEW.role <> 'OWNER' OR NEW.banned) THEN
    RAISE EXCEPTION 'An active Owner cannot be removed or demoted' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION identity.guard_user_privileges() FROM PUBLIC;
