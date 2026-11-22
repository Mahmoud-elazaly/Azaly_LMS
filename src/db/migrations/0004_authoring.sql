CREATE SCHEMA authoring;
REVOKE ALL ON SCHEMA authoring FROM PUBLIC;
ALTER TABLE public.courses
  ADD COLUMN catalog_position integer NOT NULL DEFAULT 0,
  ADD COLUMN withdrawn_at timestamptz;
--> statement-breakpoint
CREATE TABLE authoring.drafts (
  course_id uuid PRIMARY KEY CONSTRAINT drafts_course_id_courses_id_fk REFERENCES public.courses(id),
  owner_id text CONSTRAINT drafts_owner_id_user_id_fk REFERENCES identity."user"(id),
  document jsonb NOT NULL,
  edit_version integer NOT NULL DEFAULT 1,
  archived_at timestamptz
);
CREATE TABLE authoring.snapshots (
  version_id uuid PRIMARY KEY CONSTRAINT snapshots_version_id_course_versions_id_fk REFERENCES public.course_versions(id),
  document jsonb NOT NULL
);
CREATE TABLE authoring.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL CONSTRAINT events_course_id_courses_id_fk REFERENCES public.courses(id),
  version_id uuid CONSTRAINT events_version_id_course_versions_id_fk REFERENCES public.course_versions(id),
  actor_id text NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Existing catalog metadata can seed editable drafts without rewriting its revisions.
INSERT INTO authoring.drafts (course_id, document)
SELECT c.id, jsonb_build_object(
  'slug', c.slug, 'position', c.catalog_position, 'modules', '[]'::jsonb,
  'translations', coalesce((SELECT jsonb_object_agg(t.locale, jsonb_build_object('title', t.title, 'summary', t.summary))
    FROM public.course_translations t WHERE t.version_id = latest.id), '{}'::jsonb)
)
FROM public.courses c
LEFT JOIN LATERAL (
  SELECT v.id FROM public.course_versions v
  WHERE v.course_id = c.id AND v.published_at <= now()
  ORDER BY v.revision DESC LIMIT 1
) latest ON true;
--> statement-breakpoint
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'academy_authoring_runtime') THEN
    CREATE ROLE academy_authoring_runtime NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'academy_authoring_definer') THEN
    CREATE ROLE academy_authoring_definer NOLOGIN;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname IN ('academy_authoring_definer', 'academy_authoring_runtime')
    AND (rolcanlogin OR rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Authoring database roles have unexpected privileges';
  END IF;
END;
$roles$;
--> statement-breakpoint
CREATE FUNCTION authoring.course_command(actor_token text, command text, course_key uuid, payload jsonb, expected integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $command$
DECLARE
  actor_id text;
  actor_role identity.user_role;
  draft authoring.drafts%ROWTYPE;
  version_key uuid;
  publication_number integer;
  course_slug text;
  visibility text;
BEGIN
  SELECT u.id, u.role INTO actor_id, actor_role FROM identity."user" u
  JOIN identity.session s ON s.user_id = u.id
  WHERE s.token = actor_token AND s.expires_at > clock_timestamp()
    AND s.impersonated_by IS NULL AND NOT u.banned
  FOR SHARE OF s, u;
  IF NOT FOUND OR actor_role NOT IN ('OWNER', 'ADMIN', 'INSTRUCTOR') THEN
    RAISE EXCEPTION 'Authoring access denied' USING ERRCODE = '42501';
  END IF;

  IF command = 'list' THEN
    RETURN coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug,
        'translations', d.document->'translations') ORDER BY d.document->>'slug')
      FROM authoring.drafts d JOIN public.courses c ON c.id = d.course_id
      WHERE d.archived_at IS NULL AND (actor_role <> 'INSTRUCTOR' OR d.owner_id = actor_id)
    ), '[]'::jsonb);
  END IF;

  IF command = 'create' THEN
    IF payload->>'slug' IS NULL OR length(payload->>'slug') > 80
      OR payload->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
      RAISE EXCEPTION 'Invalid slug' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.courses (slug) VALUES (payload->>'slug') RETURNING id INTO course_key;
    INSERT INTO authoring.drafts (course_id, owner_id, document)
    VALUES (course_key, actor_id, jsonb_build_object('slug', payload->>'slug',
      'position', 0, 'translations', '{}'::jsonb, 'modules', '[]'::jsonb));
    RETURN jsonb_build_object('id', course_key);
  END IF;

  SELECT * INTO draft FROM authoring.drafts d WHERE d.course_id = course_key AND d.archived_at IS NULL FOR UPDATE;
  IF NOT FOUND OR (actor_role = 'INSTRUCTOR' AND draft.owner_id IS DISTINCT FROM actor_id) THEN
    RAISE EXCEPTION 'Course unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT c.slug, CASE WHEN c.withdrawn_at IS NOT NULL THEN 'withdrawn'
    WHEN EXISTS (SELECT FROM public.course_versions v WHERE v.course_id = course_key AND v.published_at <= now())
    THEN 'published' ELSE 'draft' END
  INTO course_slug, visibility FROM public.courses c WHERE c.id = course_key;

  IF command = 'read' THEN
    RETURN jsonb_build_object('id', course_key, 'version', draft.edit_version, 'visibility', visibility, 'document', draft.document);
  END IF;

  IF expected IS DISTINCT FROM draft.edit_version THEN
    RAISE EXCEPTION 'Stale draft' USING ERRCODE = '40001';
  END IF;

  IF command = 'save' THEN
    IF payload IS NULL OR octet_length(payload::text) > 400000
      OR payload->>'slug' IS NULL OR length(payload->>'slug') > 80
      OR payload->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      OR jsonb_typeof(payload->'translations') IS DISTINCT FROM 'object'
      OR jsonb_typeof(payload->'modules') IS DISTINCT FROM 'array'
      OR jsonb_typeof(payload->'position') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Invalid draft' USING ERRCODE = '22023';
    END IF;
    IF payload->>'slug' <> course_slug THEN
      IF EXISTS (SELECT FROM public.course_versions v WHERE v.course_id = course_key AND v.published_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Published slug is fixed' USING ERRCODE = '22023';
      END IF;
      UPDATE public.courses SET slug = payload->>'slug' WHERE id = course_key;
    END IF;
    UPDATE authoring.drafts SET document = payload, edit_version = edit_version + 1 WHERE course_id = course_key;
  ELSIF command = 'publish' THEN
    IF NOT EXISTS (
      SELECT FROM jsonb_each(draft.document->'translations') t
      WHERE t.key IN ('ar','en') AND length(btrim(t.value->>'title')) > 0 AND length(btrim(t.value->>'summary')) > 0
    ) OR jsonb_array_length(draft.document->'modules') = 0 OR EXISTS (
      SELECT FROM jsonb_each(draft.document->'translations') t
      WHERE t.key IN ('ar','en')
        AND (coalesce(length(btrim(t.value->>'title')), 0) > 0 OR coalesce(length(btrim(t.value->>'summary')), 0) > 0)
        AND (coalesce(length(btrim(t.value->>'title')), 0) = 0
          OR coalesce(length(btrim(t.value->>'summary')), 0) = 0
          OR EXISTS (
            SELECT FROM jsonb_array_elements(draft.document->'modules') m(value)
            WHERE coalesce(length(btrim(m.value->'titles'->>t.key)), 0) = 0
              OR coalesce(jsonb_array_length(m.value->'lessons'), 0) = 0 OR EXISTS (
              SELECT FROM jsonb_array_elements(m.value->'lessons') l(value)
              WHERE coalesce(length(btrim(l.value->'titles'->>t.key)), 0) = 0
                OR coalesce(jsonb_array_length(l.value->'blocks'), 0) = 0 OR EXISTS (
                SELECT FROM jsonb_array_elements(l.value->'blocks') b(value)
                WHERE coalesce(length(btrim(b.value->'translations'->>t.key)), 0) = 0
                  OR coalesce(b.value->>'type', '') NOT IN ('paragraph','heading','code','callout')
              )
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'No publishable translation' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(max(v.revision), 0) + 1 INTO publication_number FROM public.course_versions v WHERE v.course_id = course_key;
    INSERT INTO public.course_versions (course_id, revision, published_at)
      VALUES (course_key, publication_number, clock_timestamp()) RETURNING id INTO version_key;
    INSERT INTO authoring.snapshots (version_id, document) VALUES (version_key, draft.document);
    INSERT INTO public.course_translations (version_id, locale, title, summary)
    SELECT version_key, t.key::public.course_locale, t.value->>'title', t.value->>'summary'
      FROM jsonb_each(draft.document->'translations') t
      WHERE t.key IN ('ar','en') AND length(btrim(t.value->>'title')) > 0 AND length(btrim(t.value->>'summary')) > 0;
    UPDATE public.courses SET withdrawn_at = NULL, catalog_position = (draft.document->>'position')::integer WHERE id = course_key;
    UPDATE authoring.drafts SET edit_version = edit_version + 1 WHERE course_id = course_key;
  ELSIF command IN ('unpublish', 'archive') THEN
    IF command = 'unpublish' AND visibility <> 'published' THEN
      RAISE EXCEPTION 'Course is not live' USING ERRCODE = '22023';
    END IF;
    SELECT v.id INTO version_key FROM public.course_versions v WHERE v.course_id = course_key AND v.published_at <= now()
      ORDER BY v.revision DESC LIMIT 1;
    UPDATE public.courses SET withdrawn_at = clock_timestamp() WHERE id = course_key;
    UPDATE authoring.drafts SET edit_version = edit_version + 1,
      archived_at = CASE WHEN command = 'archive' THEN clock_timestamp() ELSE NULL END WHERE course_id = course_key;
  ELSE
    RAISE EXCEPTION 'Unknown course command' USING ERRCODE = '22023';
  END IF;

  IF command <> 'save' THEN
    INSERT INTO authoring.events (course_id, version_id, actor_id, action) VALUES (course_key, version_key, actor_id, command);
  END IF;
  RETURN jsonb_build_object('id', course_key, 'version', draft.edit_version + 1);
END;
$command$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION authoring.course_command(text, text, uuid, jsonb, integer) FROM PUBLIC;
GRANT USAGE ON SCHEMA authoring TO academy_authoring_runtime;
GRANT EXECUTE ON FUNCTION authoring.course_command(text, text, uuid, jsonb, integer) TO academy_authoring_runtime;
--> statement-breakpoint
GRANT USAGE ON SCHEMA identity, public, authoring TO academy_authoring_definer;
GRANT SELECT (id, role, banned), UPDATE (updated_at) ON identity."user" TO academy_authoring_definer;
GRANT SELECT (user_id, token, expires_at, impersonated_by), UPDATE (expires_at) ON identity.session TO academy_authoring_definer;
-- The column UPDATE grants above permit PostgreSQL row locks during actor validation.
GRANT SELECT, INSERT ON public.courses, public.course_versions TO academy_authoring_definer;
GRANT UPDATE (slug, withdrawn_at, catalog_position) ON public.courses TO academy_authoring_definer;
GRANT INSERT ON public.course_translations TO academy_authoring_definer;
GRANT SELECT, INSERT, UPDATE ON authoring.drafts TO academy_authoring_definer;
GRANT INSERT ON authoring.snapshots, authoring.events TO academy_authoring_definer;
GRANT CREATE ON SCHEMA authoring TO academy_authoring_definer;
ALTER FUNCTION authoring.course_command(text, text, uuid, jsonb, integer) OWNER TO academy_authoring_definer;
REVOKE CREATE ON SCHEMA authoring FROM academy_authoring_definer;
