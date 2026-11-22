CREATE SCHEMA "identity";
--> statement-breakpoint
CREATE TYPE "identity"."user_role" AS ENUM ('OWNER', 'ADMIN', 'INSTRUCTOR', 'STUDENT');
--> statement-breakpoint
CREATE TABLE "identity"."user" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL CONSTRAINT "user_email_unique" UNIQUE,
  "email_verified" boolean DEFAULT false NOT NULL,
  "image" text,
  "role" "identity"."user_role" DEFAULT 'STUDENT' NOT NULL,
  "banned" boolean DEFAULT false NOT NULL,
  "ban_reason" text,
  "ban_expires" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."session" (
  "id" text PRIMARY KEY,
  "token" text NOT NULL CONSTRAINT "session_token_unique" UNIQUE,
  "user_id" text NOT NULL CONSTRAINT "session_user_id_user_id_fk" REFERENCES "identity"."user" ("id") ON DELETE CASCADE,
  "expires_at" timestamptz NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "impersonated_by" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "identity"."session" ("user_id");
--> statement-breakpoint
CREATE TABLE "identity"."account" (
  "id" text PRIMARY KEY,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL CONSTRAINT "account_user_id_user_id_fk" REFERENCES "identity"."user" ("id") ON DELETE CASCADE,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamptz,
  "refresh_token_expires_at" timestamptz,
  "scope" text,
  "password" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "account_provider_identity_unique" UNIQUE ("provider_id", "account_id")
);
--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "identity"."account" ("user_id");
--> statement-breakpoint
CREATE TABLE "identity"."verification" (
  "id" text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "identity"."verification" ("identifier");
--> statement-breakpoint
CREATE TABLE "identity"."audit_event" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_id" text NOT NULL,
  "target_id" text NOT NULL,
  "previous_role" "identity"."user_role" NOT NULL,
  "new_role" "identity"."user_role" NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $identity_permissions$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'academy_auth_runtime') THEN
    CREATE ROLE academy_auth_runtime NOLOGIN;
  END IF;
END;
$identity_permissions$;
--> statement-breakpoint
REVOKE ALL ON SCHEMA "identity" FROM PUBLIC;
GRANT USAGE ON SCHEMA "identity" TO academy_auth_runtime;
GRANT SELECT ON "identity"."user" TO academy_auth_runtime;
GRANT INSERT ("id", "name", "email", "email_verified", "image", "created_at", "updated_at"),
  UPDATE ("name", "image", "updated_at")
  ON "identity"."user" TO academy_auth_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "identity"."session", "identity"."account", "identity"."verification"
  TO academy_auth_runtime;
