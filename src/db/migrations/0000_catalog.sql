CREATE TYPE "course_locale" AS ENUM ('ar', 'en');
--> statement-breakpoint
CREATE TABLE "courses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL CONSTRAINT "courses_slug_unique" UNIQUE,
  CONSTRAINT "courses_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "course_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL CONSTRAINT "course_versions_course_id_courses_id_fk" REFERENCES "courses" ("id"),
  "revision" integer NOT NULL,
  "published_at" timestamptz,
  CONSTRAINT "course_versions_revision_key" UNIQUE ("course_id", "revision"),
  CONSTRAINT "course_versions_positive_revision" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE INDEX "course_versions_public_idx" ON "course_versions" ("course_id", "revision" DESC) WHERE "published_at" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "course_translations" (
  "version_id" uuid NOT NULL CONSTRAINT "course_translations_version_id_course_versions_id_fk" REFERENCES "course_versions" ("id"),
  "locale" "course_locale" NOT NULL,
  "title" text NOT NULL,
  "summary" text NOT NULL,
  CONSTRAINT "course_translations_version_id_locale_pk" PRIMARY KEY ("version_id", "locale"),
  CONSTRAINT "course_translations_nonempty" CHECK (length(btrim("title")) > 0 AND length(btrim("summary")) > 0)
);
--> statement-breakpoint
DO $catalog_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'academy_reader') THEN
    GRANT SELECT ON "courses", "course_versions", "course_translations" TO academy_reader;
  END IF;
END;
$catalog_grants$;
