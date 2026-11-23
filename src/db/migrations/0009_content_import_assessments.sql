ALTER TABLE authoring.drafts ADD COLUMN last_import_digest text;
--> statement-breakpoint
CREATE FUNCTION authoring.recall_tokens(command_text text)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog AS $tokens$
DECLARE
  tokens text[] := '{}';
  token text := '';
  quoted text := '';
  escaped boolean := false;
  character text;
BEGIN
  IF length(command_text) > 512 OR command_text ~ E'[\\r\\n]' THEN RETURN NULL; END IF;
  FOREACH character IN ARRAY string_to_array(command_text, NULL) LOOP
    IF escaped THEN
      token := token || character;
      escaped := false;
    ELSIF character = chr(92) AND quoted <> chr(39) THEN
      token := token || character;
      escaped := true;
    ELSIF quoted <> '' THEN
      token := token || character;
      IF character = quoted THEN quoted := ''; END IF;
    ELSIF character IN (chr(39), chr(34)) THEN
      quoted := character;
      token := token || character;
    ELSIF character COLLATE "C" ~ '[[:space:]]' THEN
      IF token <> '' THEN tokens := array_append(tokens, token); END IF;
      token := '';
    ELSE
      token := token || character;
    END IF;
  END LOOP;
  IF escaped OR quoted <> '' THEN RETURN NULL; END IF;
  IF token <> '' THEN tokens := array_append(tokens, token); END IF;
  RETURN CASE WHEN cardinality(tokens) > 0 THEN tokens END;
END;
$tokens$;

CREATE FUNCTION authoring.recall_key(command_text text, rule_mode text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog AS $key$
DECLARE
  tokens text[] := authoring.recall_tokens(command_text);
  arguments text[];
  flags text[] := '{}';
  seen text[] := '{}';
  flag_name text;
  token text;
  end_options boolean := false;
BEGIN
  IF tokens IS NULL THEN RETURN NULL; END IF;
  IF rule_mode <> 'flags' THEN RETURN to_jsonb(array_to_string(tokens, ' ')); END IF;
  arguments := ARRAY[tokens[1]];
  FOREACH token IN ARRAY tokens[2:] LOOP
    IF token = '--' THEN end_options := true; END IF;
    IF NOT end_options AND token COLLATE "C" ~ '^(-[A-Za-z0-9]|--[A-Za-z0-9][A-Za-z0-9-]*)(=.+)?$' THEN
      flag_name := split_part(token, '=', 1);
      IF flag_name = ANY(seen) THEN RETURN NULL; END IF;
      seen := array_append(seen, flag_name);
      flags := array_append(flags, token);
    ELSE
      arguments := array_append(arguments, token);
    END IF;
  END LOOP;
  RETURN jsonb_build_array(arguments, (SELECT coalesce(jsonb_agg(flag ORDER BY flag COLLATE "C"), '[]'::jsonb)
    FROM unnest(flags) AS flag));
END;
$key$;

CREATE FUNCTION authoring.valid_bug_lines(answer jsonb, snippet text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $lines$
DECLARE
  line_count integer := cardinality(string_to_array(replace(replace(snippet, E'\r\n', E'\n'), E'\r', E'\n'), E'\n'));
BEGIN
  IF coalesce(line_count, 0) NOT BETWEEN 1 AND 120 OR jsonb_typeof(answer) IS DISTINCT FROM 'array'
    THEN RETURN false; END IF;
  RETURN jsonb_array_length(answer) BETWEEN 1 AND line_count AND NOT EXISTS (
    SELECT FROM jsonb_array_elements(answer) AS line
    WHERE jsonb_typeof(line) IS DISTINCT FROM 'number' OR CASE
      WHEN (line #>> '{}') ~ '^[1-9][0-9]{0,2}$' THEN (line #>> '{}')::integer > line_count
      ELSE true END
  ) AND (SELECT count(DISTINCT line) FROM jsonb_array_elements(answer) AS line) = jsonb_array_length(answer);
END;
$lines$;

CREATE FUNCTION authoring.validate_extended_question(question jsonb, bank boolean)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog AS $validate$
DECLARE
  kind text := question->>'type';
  translation jsonb;
  language text;
  rule jsonb := question->'rule';
  rule_value text := rule->>'value';
  rule_mode text := rule->>'mode';
  common_fields text[] := CASE WHEN bank THEN ARRAY['type','translations','tags']
    ELSE ARRAY['type','translations','id','bankSource'] END;
BEGIN
  IF jsonb_typeof(question->'type') IS DISTINCT FROM 'string'
    OR jsonb_typeof(question->'translations') IS DISTINCT FROM 'object'
    OR (question->'translations') - ARRAY['ar','en'] <> '{}'::jsonb
    THEN RAISE EXCEPTION 'Invalid question translations' USING ERRCODE = '22023'; END IF;
  FOREACH language IN ARRAY ARRAY['ar','en'] LOOP
    translation := question->'translations'->language;
    IF NOT bank AND translation IS NULL THEN CONTINUE; END IF;
    IF jsonb_typeof(translation) IS DISTINCT FROM 'object'
      OR translation - ARRAY['prompt','explanation'] <> '{}'::jsonb
      OR jsonb_typeof(translation->'prompt') IS DISTINCT FROM 'string'
      OR length(btrim(translation->>'prompt')) NOT BETWEEN (CASE WHEN bank THEN 1 ELSE 0 END) AND 160
      OR (bank OR translation ? 'explanation') AND (
        jsonb_typeof(translation->'explanation') IS DISTINCT FROM 'string'
        OR length(btrim(translation->>'explanation')) NOT BETWEEN (CASE WHEN bank THEN 1 ELSE 0 END) AND 2000)
    THEN RAISE EXCEPTION 'Invalid question translation' USING ERRCODE = '22023'; END IF;
  END LOOP;

  IF kind = 'find_bug' THEN
    IF question - (common_fields || ARRAY['language','snippet','faultyLines']) <> '{}'::jsonb
      OR coalesce(question->>'language', '') NOT IN ('config','yaml','dockerfile','promql','nginx')
      OR jsonb_typeof(question->'snippet') IS DISTINCT FROM 'string'
      OR length(btrim(question->>'snippet')) NOT BETWEEN 1 AND 8000
      OR length(question->>'snippet') > 8000
      OR NOT authoring.valid_bug_lines(question->'faultyLines', question->>'snippet')
    THEN RAISE EXCEPTION 'Invalid bug question' USING ERRCODE = '22023'; END IF;
  ELSIF kind = 'cli_recall' THEN
    IF question - (common_fields || 'rule'::text) <> '{}'::jsonb
      OR jsonb_typeof(rule) IS DISTINCT FROM 'object' OR rule - ARRAY['mode','value'] <> '{}'::jsonb
      OR coalesce(rule_mode, '') NOT IN ('exact','flags','regex')
      OR jsonb_typeof(rule->'value') IS DISTINCT FROM 'string'
      OR length(btrim(rule_value)) NOT BETWEEN 1 AND 512 OR length(rule_value) > 512
      OR rule_value ~ E'[\\r\\n]'
    THEN RAISE EXCEPTION 'Invalid CLI question' USING ERRCODE = '22023'; END IF;
    IF rule_mode = 'regex' THEN
      IF length(rule_value) > 200 OR strpos(rule_value, '(?') > 0 OR rule_value ~ (chr(92)||chr(92)||'[0-9]')
      THEN RAISE EXCEPTION 'Unsupported CLI pattern' USING ERRCODE = '22023'; END IF;
      PERFORM '' COLLATE "C" ~ ('^(?:' || rule_value || ')$');
    ELSIF authoring.recall_key(rule_value, rule_mode) IS NULL THEN
      RAISE EXCEPTION 'Invalid expected command' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown question type' USING ERRCODE = '22023';
  END IF;
EXCEPTION WHEN invalid_regular_expression THEN
  RAISE EXCEPTION 'Invalid CLI pattern' USING ERRCODE = '22023';
END;
$validate$;

CREATE FUNCTION authoring.guard_extended_questions() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $guard$
DECLARE
  question jsonb;
  language text;
BEGIN
  FOR question IN SELECT item
    FROM jsonb_array_elements(coalesce(NEW.document->'quizzes', '[]'::jsonb)) AS quiz
    CROSS JOIN LATERAL jsonb_array_elements(quiz->'questions') AS item
    WHERE coalesce(item->>'type', 'mcq') <> 'mcq'
  LOOP
    PERFORM authoring.validate_extended_question(question, false);
    IF TG_TABLE_NAME = 'snapshots' THEN
      FOR language IN SELECT key FROM jsonb_each(NEW.document->'translations') WHERE length(btrim(value->>'title')) > 0
      LOOP
        IF coalesce(length(btrim(question->'translations'->language->>'prompt')), 0) = 0 THEN
          RAISE EXCEPTION 'Incomplete question translation' USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$guard$;

CREATE TRIGGER draft_extended_questions BEFORE INSERT OR UPDATE OF document ON authoring.drafts
  FOR EACH ROW EXECUTE FUNCTION authoring.guard_extended_questions();
CREATE TRIGGER snapshot_extended_questions BEFORE INSERT ON authoring.snapshots
  FOR EACH ROW EXECUTE FUNCTION authoring.guard_extended_questions();

REVOKE ALL ON FUNCTION authoring.recall_tokens(text), authoring.recall_key(text,text),
  authoring.valid_bug_lines(jsonb,text), authoring.validate_extended_question(jsonb,boolean),
  authoring.guard_extended_questions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION authoring.recall_tokens(text), authoring.recall_key(text,text),
  authoring.valid_bug_lines(jsonb,text) TO academy_authoring_definer, academy_learner_definer;
GRANT EXECUTE ON FUNCTION authoring.validate_extended_question(jsonb,boolean) TO academy_authoring_definer;
--> statement-breakpoint
CREATE FUNCTION authoring.import_draft(actor_token text, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $import$
DECLARE
  actor record;
  draft authoring.drafts%ROWTYPE;
  course_key uuid;
  course_slug text := payload->>'slug';
  digest text := encode(sha256(convert_to(payload::text, 'UTF8')), 'hex');
BEGIN
  SELECT * INTO actor FROM authoring.phase5_actor(actor_token);
  IF NOT FOUND THEN RAISE EXCEPTION 'Import access denied' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR octet_length(payload::text) > 400000
    OR course_slug IS NULL OR length(course_slug) > 80 OR course_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR jsonb_typeof(payload->'translations') IS DISTINCT FROM 'object'
    OR jsonb_typeof(payload->'modules') IS DISTINCT FROM 'array'
    OR jsonb_typeof(payload->'position') IS DISTINCT FROM 'number'
    OR payload - ARRAY['slug','position','translations','modules','quizzes'] <> '{}'::jsonb
    OR EXISTS (SELECT FROM jsonb_array_elements(coalesce(payload->'quizzes','[]'::jsonb)) AS q
      CROSS JOIN LATERAL jsonb_array_elements(q->'questions') AS item WHERE item ? 'bankSource')
  THEN RAISE EXCEPTION 'Invalid imported document' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.courses(slug) VALUES (course_slug)
    ON CONFLICT (slug) DO NOTHING RETURNING id INTO course_key;
  IF FOUND THEN
    INSERT INTO authoring.drafts (course_id, owner_id, document, last_import_digest)
      VALUES (course_key, actor.actor_id, payload, digest) RETURNING * INTO draft;
    RETURN jsonb_build_object('id', course_key, 'version', draft.edit_version, 'status', 'created');
  END IF;
  SELECT d.* INTO draft FROM authoring.drafts d JOIN public.courses c ON c.id = d.course_id
    WHERE c.slug = course_slug AND d.archived_at IS NULL FOR UPDATE OF d;
  IF NOT FOUND OR (actor.actor_role = 'INSTRUCTOR' AND draft.owner_id IS DISTINCT FROM actor.actor_id) THEN
    RAISE EXCEPTION 'Draft unavailable' USING ERRCODE = '42501';
  END IF;
  IF draft.last_import_digest IS NULL OR draft.last_import_digest IS DISTINCT FROM
    encode(sha256(convert_to(draft.document::text, 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'Existing draft has author edits' USING ERRCODE = '40001';
  END IF;
  IF draft.document = payload THEN
    RETURN jsonb_build_object('id', draft.course_id, 'version', draft.edit_version, 'status', 'unchanged');
  END IF;
  UPDATE authoring.drafts SET document = payload, last_import_digest = digest, edit_version = edit_version + 1
    WHERE course_id = draft.course_id RETURNING * INTO draft;
  RETURN jsonb_build_object('id', draft.course_id, 'version', draft.edit_version, 'status', 'updated');
END;
$import$;

REVOKE ALL ON FUNCTION authoring.import_draft(text,jsonb) FROM PUBLIC;
GRANT CREATE ON SCHEMA authoring TO academy_authoring_definer;
ALTER FUNCTION authoring.import_draft(text,jsonb) OWNER TO academy_authoring_definer;
REVOKE CREATE ON SCHEMA authoring FROM academy_authoring_definer;
GRANT EXECUTE ON FUNCTION authoring.import_draft(text,jsonb) TO academy_authoring_runtime;
--> statement-breakpoint
CREATE FUNCTION learning.assessment_answer(question jsonb, answer jsonb, locale_key public.course_locale)
RETURNS boolean LANGUAGE plpgsql SET search_path = pg_catalog AS $answer$
DECLARE
  kind text := coalesce(question->>'type','mcq');
  rule_mode text := question->'rule'->>'mode';
  rule_value text := question->'rule'->>'value';
  normalized jsonb;
BEGIN
  IF kind = 'mcq' AND jsonb_typeof(answer) = 'number' AND (answer #>> '{}') IN ('0','1','2','3') THEN
    IF (answer #>> '{}')::integer < jsonb_array_length(question->'translations'->locale_key::text->'choices') THEN
      RETURN answer = question->'correct';
    END IF;
  ELSIF kind = 'find_bug' AND authoring.valid_bug_lines(answer, question->>'snippet') THEN
    RETURN answer @> (question->'faultyLines') AND (question->'faultyLines') @> answer;
  ELSIF kind = 'cli_recall' AND jsonb_typeof(answer) = 'string' THEN
    normalized := authoring.recall_key(answer #>> '{}', rule_mode);
    IF normalized IS NOT NULL THEN
      IF rule_mode = 'regex' THEN RETURN (normalized #>> '{}') COLLATE "C" ~ ('^(?:' || rule_value || ')$'); END IF;
      RETURN normalized = authoring.recall_key(rule_value, rule_mode);
    END IF;
  END IF;
  RAISE EXCEPTION 'Invalid quiz answers' USING ERRCODE = '22023';
END;
$answer$;

REVOKE ALL ON FUNCTION learning.assessment_answer(jsonb,jsonb,public.course_locale) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION learning.assessment_answer(jsonb,jsonb,public.course_locale) TO academy_learner_definer;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION authoring.course_command(actor_token text, command text, course_key uuid, payload jsonb, expected integer)
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
                  OR coalesce(b.value->>'type', '') NOT IN ('paragraph','heading','code','callout','markdown')
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
CREATE OR REPLACE FUNCTION authoring.bank_command(actor_token text, operation text, question_key uuid, payload jsonb, expected integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $bank$
DECLARE
  actor record;
  entry authoring.bank_questions%ROWTYPE;
  translated jsonb;
  language text;
  ar_count integer;
BEGIN
  SELECT * INTO actor FROM authoring.phase5_actor(actor_token);
  IF NOT FOUND THEN RAISE EXCEPTION 'Question bank access denied' USING ERRCODE = '42501'; END IF;

  IF operation = 'list' THEN
    RETURN coalesce((
      SELECT jsonb_agg(b.question || jsonb_build_object('id', b.id, 'version', b.edit_version,
        'archived', b.archived_at IS NOT NULL, 'ownerId', b.owner_id) ORDER BY b.archived_at IS NOT NULL, b.updated_at DESC, b.id)
      FROM authoring.bank_questions b WHERE actor.actor_role <> 'INSTRUCTOR' OR b.owner_id = actor.actor_id
    ), '[]'::jsonb);
  END IF;
  IF operation IS NULL OR operation NOT IN ('read','create','save','archive') THEN
    RAISE EXCEPTION 'Unknown question operation' USING ERRCODE = '22023';
  END IF;

  IF operation <> 'create' THEN
    SELECT * INTO entry FROM authoring.bank_questions b WHERE b.id = question_key
      AND (actor.actor_role <> 'INSTRUCTOR' OR b.owner_id = actor.actor_id) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Question unavailable' USING ERRCODE = '42501'; END IF;
    IF operation = 'read' THEN
      RETURN entry.question || jsonb_build_object('id', entry.id, 'version', entry.edit_version, 'archived', entry.archived_at IS NOT NULL, 'ownerId', entry.owner_id);
    END IF;
    IF expected IS DISTINCT FROM entry.edit_version OR entry.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Stale or archived question' USING ERRCODE = '40001';
    END IF;
  END IF;

  IF operation IN ('create','save') THEN
    IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR octet_length(payload::text) > 20000
      OR jsonb_typeof(payload->'translations') IS DISTINCT FROM 'object'
      OR (payload->'translations') - ARRAY['ar','en'] <> '{}'::jsonb
      OR jsonb_typeof(payload->'tags') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid bank question' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(payload->'tags') > 12 OR EXISTS (
      SELECT FROM jsonb_array_elements(payload->'tags') tag
      WHERE jsonb_typeof(tag) <> 'string' OR length(btrim(tag #>> '{}')) NOT BETWEEN 1 AND 40
    ) THEN RAISE EXCEPTION 'Invalid question tags' USING ERRCODE = '22023'; END IF;
    IF coalesce(payload->>'type', 'mcq') <> 'mcq' THEN
      PERFORM authoring.validate_extended_question(payload, true);
    ELSE
      IF payload - ARRAY['type','correct','translations','tags'] <> '{}'::jsonb
        OR (payload ? 'type' AND payload->'type' <> '"mcq"'::jsonb)
        OR coalesce(payload->>'correct','') !~ '^[0-3]$'
        OR jsonb_typeof(payload->'correct') IS DISTINCT FROM 'number'
      THEN RAISE EXCEPTION 'Invalid bank question' USING ERRCODE = '22023'; END IF;
      FOREACH language IN ARRAY ARRAY['ar','en'] LOOP
        translated := payload->'translations'->language;
        IF jsonb_typeof(translated) IS DISTINCT FROM 'object'
          OR translated - ARRAY['prompt','choices','explanation'] <> '{}'::jsonb
          OR jsonb_typeof(translated->'prompt') IS DISTINCT FROM 'string'
          OR jsonb_typeof(translated->'explanation') IS DISTINCT FROM 'string'
          OR length(btrim(translated->>'prompt')) NOT BETWEEN 1 AND 160
          OR length(btrim(translated->>'explanation')) NOT BETWEEN 1 AND 2000
          OR jsonb_typeof(translated->'choices') IS DISTINCT FROM 'array' THEN
          RAISE EXCEPTION 'Invalid question translation' USING ERRCODE = '22023';
        END IF;
        IF jsonb_array_length(translated->'choices') NOT BETWEEN 2 AND 4 OR EXISTS (
          SELECT FROM jsonb_array_elements(translated->'choices') choice
          WHERE jsonb_typeof(choice) <> 'string' OR length(btrim(choice #>> '{}')) NOT BETWEEN 1 AND 300
        ) THEN RAISE EXCEPTION 'Invalid question choices' USING ERRCODE = '22023'; END IF;
        IF language = 'ar' THEN ar_count := jsonb_array_length(translated->'choices'); END IF;
        IF jsonb_array_length(translated->'choices') <> ar_count OR (payload->>'correct')::integer >= ar_count THEN
          RAISE EXCEPTION 'Invalid answer index' USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF operation = 'create' THEN
    INSERT INTO authoring.bank_questions(owner_id, question) VALUES (actor.actor_id, payload) RETURNING * INTO entry;
  ELSIF operation = 'save' THEN
    UPDATE authoring.bank_questions SET question = payload, edit_version = edit_version + 1,
      updated_at = clock_timestamp() WHERE id = question_key RETURNING * INTO entry;
  ELSE
    UPDATE authoring.bank_questions SET archived_at = clock_timestamp(), edit_version = edit_version + 1,
      updated_at = clock_timestamp() WHERE id = question_key RETURNING * INTO entry;
  END IF;
  RETURN entry.question || jsonb_build_object('id', entry.id, 'version', entry.edit_version, 'archived', entry.archived_at IS NOT NULL, 'ownerId', entry.owner_id);
END;
$bank$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION learning.student_command(actor_token text, operation text, enrollment_key uuid, locale_key public.course_locale, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $command$
DECLARE
  actor text;
  course_key uuid;
  revision_key uuid;
  enrollment learning.enrollments%ROWTYPE;
  snapshot jsonb;
  quiz jsonb;
  lesson_key uuid;
  attempt_key uuid;
  graded learning.attempts%ROWTYPE;
  score integer;
  total integer;
BEGIN
  SELECT u.id INTO actor FROM identity."user" u JOIN identity.session s ON s.user_id = u.id
  WHERE s.token = actor_token AND s.expires_at > clock_timestamp() AND s.impersonated_by IS NULL
    AND NOT u.banned AND u.role = 'STUDENT'
  FOR SHARE OF s, u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student access denied' USING ERRCODE = '42501'; END IF;

  IF operation = 'list' THEN
    RETURN coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', e.id, 'title', coalesce(t.title, c.slug),
        'localeAvailable', t.title IS NOT NULL,
        'completed', (SELECT count(*) FROM learning.lesson_progress p WHERE p.enrollment_id = e.id AND p.completed_at IS NOT NULL))
        ORDER BY e.created_at DESC)
      FROM learning.enrollments e JOIN public.courses c ON c.id = e.course_id
      LEFT JOIN public.course_translations t ON t.version_id = e.version_id AND t.locale = locale_key
      WHERE e.student_id = actor
    ), '[]'::jsonb);
  END IF;

  IF operation = 'enroll' THEN
    SELECT c.id INTO course_key FROM public.courses c WHERE c.slug = payload->>'slug' AND c.withdrawn_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Course unavailable' USING ERRCODE = '22023'; END IF;

    SELECT e.id INTO enrollment_key FROM learning.enrollments e WHERE e.student_id = actor AND e.course_id = course_key;
    IF FOUND THEN RETURN jsonb_build_object('id', enrollment_key); END IF;

    SELECT v.id INTO revision_key FROM public.course_versions v WHERE v.course_id = course_key
      AND v.published_at <= clock_timestamp() ORDER BY v.revision DESC LIMIT 1;
    IF revision_key IS NULL OR NOT EXISTS (SELECT FROM authoring.snapshots s WHERE s.version_id = revision_key)
       OR NOT EXISTS (SELECT FROM public.course_translations t WHERE t.version_id = revision_key AND t.locale = locale_key) THEN
      RAISE EXCEPTION 'Course unavailable' USING ERRCODE = '22023';
    END IF;

    INSERT INTO learning.enrollments (student_id, course_id, version_id) VALUES (actor, course_key, revision_key)
      ON CONFLICT (student_id, course_id) DO NOTHING;
    SELECT e.id INTO enrollment_key FROM learning.enrollments e WHERE e.student_id = actor AND e.course_id = course_key;
    RETURN jsonb_build_object('id', enrollment_key);
  END IF;

  SELECT e.* INTO enrollment FROM learning.enrollments e WHERE e.id = enrollment_key AND e.student_id = actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment access denied' USING ERRCODE = '42501'; END IF;
  SELECT s.document INTO snapshot FROM authoring.snapshots s WHERE s.version_id = enrollment.version_id;

  IF operation = 'read' THEN
    RETURN jsonb_build_object(
      'id', enrollment.id, 'resumeLessonId', enrollment.resume_lesson_id,
      'content', (SELECT jsonb_build_object('title', t.title, 'modules', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', m.value->>'id', 'title', m.value->'titles'->>locale_key::text,
          'lessons', (SELECT jsonb_agg(jsonb_build_object('id', l.value->>'id',
            'title', l.value->'titles'->>locale_key::text,
            'blocks', (SELECT jsonb_agg(jsonb_build_object('id', b.value->>'id', 'type', b.value->>'type',
              'text', b.value->'translations'->>locale_key::text) ORDER BY b.ord)
              FROM jsonb_array_elements(l.value->'blocks') WITH ORDINALITY b(value, ord))
          ) ORDER BY l.ord) FROM jsonb_array_elements(m.value->'lessons') WITH ORDINALITY l(value, ord))
        ) ORDER BY m.ord) FROM jsonb_array_elements(snapshot->'modules') WITH ORDINALITY m(value, ord)
      ), '[]'::jsonb))
        FROM public.course_translations t WHERE t.version_id = enrollment.version_id AND t.locale = locale_key),
      'progress', coalesce((SELECT jsonb_agg(jsonb_build_object('lessonId', p.lesson_id,
        'completed', p.completed_at IS NOT NULL, 'bookmarked', p.bookmarked)) FROM learning.lesson_progress p
        WHERE p.enrollment_id = enrollment.id), '[]'::jsonb),
      'quizzes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', q.value->>'id',
        'title', q.value->'titles'->>locale_key::text,
        'questions', (SELECT jsonb_agg(jsonb_build_object('id', question.value->>'id',
          'prompt', question.value->'translations'->locale_key::text->>'prompt') ||
          CASE question.value->>'type'
            WHEN 'find_bug' THEN jsonb_build_object('type', 'find_bug', 'language', question.value->>'language',
              'snippet', question.value->>'snippet')
            WHEN 'cli_recall' THEN jsonb_build_object('type', 'cli_recall')
            ELSE jsonb_build_object('choices', question.value->'translations'->locale_key::text->'choices')
          END ORDER BY question.ord)
          FROM jsonb_array_elements(q.value->'questions') WITH ORDINALITY question(value, ord))) ORDER BY q.ord)
        FROM jsonb_array_elements(coalesce(snapshot->'quizzes', '[]'::jsonb)) WITH ORDINALITY q(value, ord)
        WHERE q.value->'titles'->>locale_key::text IS NOT NULL
          AND EXISTS (SELECT FROM public.course_translations t WHERE t.version_id = enrollment.version_id AND t.locale = locale_key)),
        '[]'::jsonb),
      'grades', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'quizId', a.quiz_id, 'score', a.score,
        'total', a.total, 'gradedAt', a.graded_at) ORDER BY a.graded_at DESC, a.id)
        FROM learning.attempts a WHERE a.enrollment_id = enrollment.id), '[]'::jsonb)
    );
  END IF;

  IF NOT EXISTS (SELECT FROM public.course_translations t WHERE t.version_id = enrollment.version_id AND t.locale = locale_key) THEN
    RAISE EXCEPTION 'Translation unavailable' USING ERRCODE = '22023';
  END IF;

  IF operation IN ('resume', 'complete', 'bookmark') THEN
    lesson_key := (payload->>'lessonId')::uuid;
    IF NOT EXISTS (SELECT FROM jsonb_array_elements(snapshot->'modules') m(value)
      CROSS JOIN LATERAL jsonb_array_elements(m.value->'lessons') l(value) WHERE l.value->>'id' = lesson_key::text) THEN
      RAISE EXCEPTION 'Unknown lesson' USING ERRCODE = '22023';
    END IF;
    IF operation IN ('resume', 'complete') THEN
      UPDATE learning.enrollments SET resume_lesson_id = lesson_key WHERE id = enrollment.id;
    END IF;
    IF operation = 'complete' THEN
      INSERT INTO learning.lesson_progress AS prior (enrollment_id, lesson_id, completed_at) VALUES (enrollment.id, lesson_key, now())
      ON CONFLICT (enrollment_id, lesson_id) DO UPDATE SET completed_at = coalesce(prior.completed_at, excluded.completed_at);
    END IF;
    IF operation = 'bookmark' THEN
      IF jsonb_typeof(payload->'bookmarked') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'Invalid bookmark' USING ERRCODE = '22023';
      END IF;
      INSERT INTO learning.lesson_progress (enrollment_id, lesson_id, bookmarked)
        VALUES (enrollment.id, lesson_key, (payload->>'bookmarked')::boolean)
      ON CONFLICT (enrollment_id, lesson_id) DO UPDATE SET bookmarked = excluded.bookmarked;
    END IF;
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF operation <> 'submit' THEN RAISE EXCEPTION 'Unknown student operation' USING ERRCODE = '22023'; END IF;
  SELECT q.value INTO quiz FROM jsonb_array_elements(coalesce(snapshot->'quizzes', '[]'::jsonb)) q(value)
    WHERE q.value->>'id' = payload->>'quizId' AND q.value->'titles'->>locale_key::text IS NOT NULL;
  IF NOT FOUND OR jsonb_typeof(payload->'answers') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid quiz submission' USING ERRCODE = '22023';
  END IF;

  attempt_key := (payload->>'attemptId')::uuid;
  total := jsonb_array_length(quiz->'questions');
  IF total = 0 OR (SELECT count(*) FROM jsonb_object_keys(payload->'answers')) <> total THEN
    RAISE EXCEPTION 'Invalid quiz answers' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) FILTER (WHERE learning.assessment_answer(q.value, payload->'answers'->(q.value->>'id'), locale_key))
    INTO score FROM jsonb_array_elements(quiz->'questions') q(value);

  INSERT INTO learning.attempts(id, enrollment_id, quiz_id, answers, score, total)
    VALUES (attempt_key, enrollment.id, (quiz->>'id')::uuid, payload->'answers', score, total) ON CONFLICT (id) DO NOTHING;
  SELECT a.* INTO graded FROM learning.attempts a WHERE a.id = attempt_key AND a.enrollment_id = enrollment.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt access denied' USING ERRCODE = '42501'; END IF;
  IF graded.quiz_id IS DISTINCT FROM (quiz->>'id')::uuid OR graded.answers IS DISTINCT FROM payload->'answers' THEN
    RAISE EXCEPTION 'Attempt already recorded' USING ERRCODE = '23505';
  END IF;
  RETURN jsonb_build_object('id', graded.id, 'score', graded.score, 'total', graded.total, 'gradedAt', graded.graded_at);
END;
$command$;
REVOKE ALL ON FUNCTION authoring.course_command(text,text,uuid,jsonb,integer),
  authoring.bank_command(text,text,uuid,jsonb,integer),
  learning.student_command(text,text,uuid,public.course_locale,jsonb) FROM PUBLIC;
