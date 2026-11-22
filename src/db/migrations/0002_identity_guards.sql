-- Drizzle includes all mapped user columns in INSERT, using DEFAULT for omitted values.
GRANT INSERT ON "identity"."user" TO academy_auth_runtime;
--> statement-breakpoint
CREATE FUNCTION "identity"."guard_user_privileges"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $guard$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only the table owner can insert an identity with privileged fields.
    IF current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID))
      AND (NEW.role <> 'STUDENT' OR NEW.banned OR NEW.ban_reason IS NOT NULL OR NEW.ban_expires IS NOT NULL) THEN
      RAISE EXCEPTION 'Privileged identity fields cannot be set at registration' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- This slice supports a permanent bootstrap Owner. Transfers require a separate policy.
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
--> statement-breakpoint
CREATE TRIGGER "guard_user_privileges" BEFORE INSERT OR UPDATE OR DELETE ON "identity"."user"
FOR EACH ROW EXECUTE FUNCTION "identity"."guard_user_privileges"();
