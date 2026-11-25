CREATE SCHEMA "knowledge";
--> statement-breakpoint
CREATE TYPE "knowledge"."relation_type" AS ENUM('prerequisite', 'integrates_with', 'monitors', 'secures', 'deploys_to');--> statement-breakpoint
CREATE TYPE "knowledge"."track" AS ENUM('linux-os', 'web-proxy', 'git-ci', 'containers', 'observability', 'security');--> statement-breakpoint
CREATE TABLE "knowledge"."concept_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_concept_id" uuid NOT NULL,
	"target_concept_id" uuid NOT NULL,
	"relation_type" "knowledge"."relation_type" NOT NULL,
	CONSTRAINT "concept_edge_unique" UNIQUE("source_concept_id","target_concept_id","relation_type"),
	CONSTRAINT "concept_edge_distinct_ends" CHECK ("knowledge"."concept_edges"."source_concept_id" <> "knowledge"."concept_edges"."target_concept_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge"."concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"track_slug" "knowledge"."track" NOT NULL,
	"title_en" text NOT NULL,
	"title_ar" text NOT NULL,
	"summary_en" text NOT NULL,
	"summary_ar" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concepts_slug_unique" UNIQUE("slug"),
	CONSTRAINT "concept_slug_format" CHECK ("knowledge"."concepts"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("knowledge"."concepts"."slug") <= 64),
	CONSTRAINT "concept_bilingual_copy" CHECK (length(btrim("knowledge"."concepts"."title_en")) BETWEEN 1 AND 120
    AND length(btrim("knowledge"."concepts"."title_ar")) BETWEEN 1 AND 120 AND length(btrim("knowledge"."concepts"."summary_en")) BETWEEN 1 AND 1200
    AND length(btrim("knowledge"."concepts"."summary_ar")) BETWEEN 1 AND 1200)
);
--> statement-breakpoint
CREATE TABLE "knowledge"."lab_concepts" (
	"course_slug" text,
	"lab_id" uuid,
	"real_template_version" text,
	"concept_id" uuid NOT NULL,
	CONSTRAINT "lab_concepts_guided_unique" UNIQUE("course_slug","lab_id","concept_id"),
	CONSTRAINT "lab_concepts_real_unique" UNIQUE("real_template_version","concept_id"),
	CONSTRAINT "lab_concepts_kind" CHECK (("knowledge"."lab_concepts"."course_slug" IS NOT NULL AND "knowledge"."lab_concepts"."lab_id" IS NOT NULL AND "knowledge"."lab_concepts"."real_template_version" IS NULL)
    OR ("knowledge"."lab_concepts"."course_slug" IS NULL AND "knowledge"."lab_concepts"."lab_id" IS NULL AND "knowledge"."lab_concepts"."real_template_version" = 'nginx-reverse-proxy@1'
      AND "knowledge"."lab_concepts"."real_template_version" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "knowledge"."lesson_concepts" (
	"course_slug" text NOT NULL,
	"lesson_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	CONSTRAINT "lesson_concepts_course_slug_lesson_id_concept_id_pk" PRIMARY KEY("course_slug","lesson_id","concept_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge"."question_concepts" (
	"course_slug" text NOT NULL,
	"question_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	CONSTRAINT "question_concepts_course_slug_question_id_concept_id_pk" PRIMARY KEY("course_slug","question_id","concept_id")
);
--> statement-breakpoint
ALTER TABLE "knowledge"."concept_edges" ADD CONSTRAINT "concept_edges_source_concept_id_concepts_id_fk" FOREIGN KEY ("source_concept_id") REFERENCES "knowledge"."concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."concept_edges" ADD CONSTRAINT "concept_edges_target_concept_id_concepts_id_fk" FOREIGN KEY ("target_concept_id") REFERENCES "knowledge"."concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."lab_concepts" ADD CONSTRAINT "lab_concepts_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "knowledge"."concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."lesson_concepts" ADD CONSTRAINT "lesson_concepts_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "knowledge"."concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge"."question_concepts" ADD CONSTRAINT "question_concepts_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "knowledge"."concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "concept_edges_target_idx" ON "knowledge"."concept_edges" USING btree ("target_concept_id");--> statement-breakpoint
INSERT INTO knowledge.concepts (slug, track_slug, title_en, title_ar, summary_en, summary_ar) VALUES
  ('linux-networking', 'linux-os', 'Linux Networking', 'شبكات لينكس', 'Trace how Linux resolves names, routes packets, and exposes services on listening sockets.', 'تتبّع كيف يحلّ لينكس أسماء النطاقات ويوجّه الحزم ويتيح الخدمات عبر مقابس الاستماع.'),
  ('nginx-reverse-proxy', 'web-proxy', 'NGINX Reverse Proxy', 'الوكيل العكسي NGINX', 'Route client requests to an upstream service and verify that the proxy reaches the intended backend.', 'وجّه طلبات العملاء إلى خدمة خلفية وتحقّق من وصول الوكيل إلى الوجهة المقصودة.'),
  ('tls-certbot', 'security', 'TLS / Certbot', 'TLS وCertbot', 'Encrypt HTTP traffic with TLS and use Certbot to obtain and renew certificates for the proxy.', 'شفّر حركة HTTP باستخدام TLS واستعمل Certbot لإصدار شهادات الوكيل وتجديدها.'),
  ('blackbox-exporter', 'observability', 'Blackbox Exporter', 'مصدّر Blackbox', 'Probe endpoints from the outside and expose availability, latency, and certificate expiry as metrics.', 'اختبر نقاط الاتصال من الخارج وسجّل التوافر وزمن الاستجابة وانتهاء الشهادات كمقاييس.'),
  ('prometheus', 'observability', 'Prometheus', 'Prometheus', 'Collect time series from scrape targets, identify them by labels, and verify that the expected series are present.', 'اجمع السلاسل الزمنية من أهداف الجلب وميّزها بالوسوم وتحقّق من وجود السلاسل المتوقعة.'),
  ('promql', 'observability', 'PromQL', 'PromQL', 'Query Prometheus time series to measure request rates, errors, and latency.', 'استعلم عن سلاسل Prometheus الزمنية لقياس معدّلات الطلبات والأخطاء وزمن الاستجابة.'),
  ('grafana-dashboards', 'observability', 'Grafana Dashboards', 'لوحات Grafana', 'Connect a data source and build panels that explain service behavior at a glance.', 'اربط مصدر البيانات وأنشئ لوحات توضّح سلوك الخدمة في لمحة.'),
  ('grafana-alerts', 'observability', 'Grafana Alerts', 'تنبيهات Grafana', 'Evaluate alert rules against metrics and distinguish firing, recovery, missing data, and query errors.', 'قيّم قواعد التنبيه باستخدام المقاييس وميّز بين انطلاق التنبيه والتعافي وغياب البيانات وأخطاء الاستعلام.'),
  ('git', 'git-ci', 'Git', 'Git', 'Track source changes in commits and use branches to review and integrate work.', 'تتبّع تغييرات المصدر في الالتزامات واستعمل الفروع لمراجعة العمل ودمجه.'),
  ('gitlab-ci', 'git-ci', 'GitLab CI', 'GitLab CI', 'Run repeatable build, test, and delivery jobs from the repository pipeline definition.', 'شغّل مهام البناء والاختبار والتسليم بصورة قابلة للتكرار من تعريف خط العمل في المستودع.'),
  ('docker-registry', 'containers', 'Docker Registry', 'سجل Docker', 'Publish and pull named container images using tags and immutable digests.', 'انشر صور الحاويات ذات الأسماء واسحبها بالوسوم والبصمات الثابتة.'),
  ('kubernetes-openshift', 'containers', 'Kubernetes / OpenShift', 'Kubernetes وOpenShift', 'Deploy images from a registry as workloads and expose them with services or routes.', 'انشر صور السجل كأحمال عمل وأتح الوصول إليها عبر الخدمات أو المسارات.')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
INSERT INTO knowledge.concept_edges (source_concept_id, target_concept_id, relation_type)
SELECT source.id, target.id, mapping.relation::knowledge.relation_type
FROM (VALUES
  ('linux-networking', 'nginx-reverse-proxy', 'prerequisite'),
  ('nginx-reverse-proxy', 'tls-certbot', 'prerequisite'),
  ('tls-certbot', 'blackbox-exporter', 'prerequisite'),
  ('blackbox-exporter', 'prometheus', 'prerequisite'),
  ('prometheus', 'grafana-alerts', 'prerequisite'),
  ('prometheus', 'promql', 'prerequisite'),
  ('promql', 'grafana-dashboards', 'prerequisite'),
  ('grafana-dashboards', 'grafana-alerts', 'integrates_with'),
  ('blackbox-exporter', 'nginx-reverse-proxy', 'monitors'),
  ('tls-certbot', 'nginx-reverse-proxy', 'secures'),
  ('git', 'gitlab-ci', 'prerequisite'),
  ('gitlab-ci', 'docker-registry', 'prerequisite'),
  ('docker-registry', 'kubernetes-openshift', 'prerequisite'),
  ('gitlab-ci', 'kubernetes-openshift', 'deploys_to'),
  ('prometheus', 'kubernetes-openshift', 'monitors')
) mapping(source, target, relation)
JOIN knowledge.concepts source ON source.slug = mapping.source
JOIN knowledge.concepts target ON target.slug = mapping.target
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Use the curated course's version-eight UUID derivation, even when its seed has yet to be published.
WITH keys AS (
  SELECT c.id, encode(sha256(convert_to('prometheus-grafana/lesson/' || m.lesson, 'UTF8')), 'hex') AS hash
  FROM (VALUES ('signals','prometheus'), ('series','prometheus'), ('compose','linux-networking'),
    ('targets','prometheus'), ('selectors','promql'), ('rates','promql'), ('error-ratio','promql'),
    ('latency','promql'), ('explore','grafana-dashboards'), ('dashboard','grafana-dashboards'),
    ('rule-lifecycle','grafana-alerts'), ('grafana-alerts','grafana-alerts'),
    ('troubleshooting','prometheus'), ('capstone','grafana-alerts')) m(lesson, slug)
  JOIN knowledge.concepts c ON c.slug = m.slug
)
INSERT INTO knowledge.lesson_concepts (course_slug, lesson_id, concept_id)
SELECT 'prometheus-grafana', (substr(hash,1,8)||substr(hash,9,4)||'8'||substr(hash,14,3)||'8'||substr(hash,18,3)||substr(hash,21,12))::uuid, id
FROM keys ON CONFLICT DO NOTHING;
--> statement-breakpoint
WITH bank_keys AS (
  SELECT c.id, m.quiz, encode(sha256(convert_to('prometheus-grafana/bank/' || m.question, 'UTF8')), 'hex') AS hash
  FROM (VALUES ('collection','series-key','prometheus'), ('collection','scrape-success','prometheus'),
    ('collection','bounded-labels','prometheus'), ('query','counter-order','promql'), ('query','bucket-label','promql'),
    ('query','zero-traffic','promql'), ('grafana','network-address','linux-networking'),
    ('grafana','panel-type','grafana-dashboards'), ('grafana','panel-diagnosis','grafana-dashboards'),
    ('operations','pending','grafana-alerts'), ('operations','no-data','grafana-alerts'), ('operations','restore','grafana-alerts')) m(quiz, question, slug)
  JOIN knowledge.concepts c ON c.slug = m.slug
), question_keys AS (
  SELECT id, encode(sha256(convert_to('prometheus-grafana/quiz/' || quiz || '/question/' ||
    ((substr(hash,1,8)||substr(hash,9,4)||'8'||substr(hash,14,3)||'8'||substr(hash,18,3)||substr(hash,21,12))::uuid)::text, 'UTF8')), 'hex') AS hash
  FROM bank_keys
)
INSERT INTO knowledge.question_concepts (course_slug, question_id, concept_id)
SELECT 'prometheus-grafana', (substr(hash,1,8)||substr(hash,9,4)||'8'||substr(hash,14,3)||'8'||substr(hash,18,3)||substr(hash,21,12))::uuid, id
FROM question_keys ON CONFLICT DO NOTHING;
--> statement-breakpoint
WITH keys AS (
  SELECT c.id, encode(sha256(convert_to('prometheus-grafana/lab/' || m.lab, 'UTF8')), 'hex') AS hash
  FROM (VALUES ('scrapes','prometheus'), ('promql','promql'), ('dashboard','grafana-dashboards'), ('recovery','grafana-alerts')) m(lab, slug)
  JOIN knowledge.concepts c ON c.slug = m.slug
)
INSERT INTO knowledge.lab_concepts (course_slug, lab_id, concept_id)
SELECT 'prometheus-grafana', (substr(hash,1,8)||substr(hash,9,4)||'8'||substr(hash,14,3)||'8'||substr(hash,18,3)||substr(hash,21,12))::uuid, id
FROM keys ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO knowledge.lab_concepts (real_template_version, concept_id)
SELECT 'nginx-reverse-proxy@1', id FROM knowledge.concepts WHERE slug = 'nginx-reverse-proxy'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DO $role$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'academy_mastery_definer') THEN
    CREATE ROLE academy_mastery_definer NOLOGIN;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'academy_mastery_definer'
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Unexpected mastery role privileges';
  END IF;
END;
$role$;
--> statement-breakpoint
REVOKE ALL ON SCHEMA knowledge FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA knowledge FROM PUBLIC;
GRANT USAGE ON SCHEMA knowledge TO academy_learner_runtime;
GRANT USAGE ON SCHEMA knowledge, identity, authoring, learning, real_lab TO academy_mastery_definer;
GRANT SELECT ON ALL TABLES IN SCHEMA knowledge TO academy_mastery_definer;
GRANT SELECT (id, role, banned) ON identity."user" TO academy_mastery_definer;
GRANT SELECT (user_id, token, expires_at, impersonated_by) ON identity.session TO academy_mastery_definer;
GRANT SELECT (id, slug, withdrawn_at) ON public.courses TO academy_mastery_definer;
GRANT SELECT (id, course_id, revision, published_at) ON public.course_versions TO academy_mastery_definer;
GRANT SELECT (version_id, locale, title) ON public.course_translations TO academy_mastery_definer;
GRANT SELECT (version_id, document) ON authoring.snapshots TO academy_mastery_definer;
GRANT SELECT (id, student_id, course_id, version_id) ON learning.enrollments TO academy_mastery_definer;
GRANT SELECT (enrollment_id, lesson_id, completed_at) ON learning.lesson_progress TO academy_mastery_definer;
GRANT SELECT (id, enrollment_id, quiz_id, answers, graded_at) ON learning.attempts TO academy_mastery_definer;
GRANT SELECT (id, enrollment_id, lab_id, completion_provenance) ON learning.guided_attempts TO academy_mastery_definer;
GRANT SELECT (attempt_id, completion_provenance, decision) ON learning.guided_reviews TO academy_mastery_definer;
GRANT SELECT (id, learner_id, template_version) ON real_lab.attempts TO academy_mastery_definer;
GRANT SELECT (attempt_id, completion_provenance) ON real_lab.checks TO academy_mastery_definer;
GRANT EXECUTE ON FUNCTION learning.assessment_answer(jsonb,jsonb,public.course_locale),
  authoring.recall_tokens(text), authoring.recall_key(text,text), authoring.valid_bug_lines(jsonb,text) TO academy_mastery_definer;
--> statement-breakpoint
CREATE FUNCTION knowledge.learner_evidence(actor_token text, locale_key public.course_locale)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $evidence$
DECLARE
  actor text;
BEGIN
  SELECT u.id INTO actor FROM identity."user" u JOIN identity.session s ON s.user_id = u.id
  WHERE s.token = actor_token AND s.expires_at > statement_timestamp() AND s.impersonated_by IS NULL
    AND NOT u.banned AND u.role = 'STUDENT';
  IF NOT FOUND THEN RAISE EXCEPTION 'Student access denied' USING ERRCODE = '42501'; END IF;

  RETURN (
    WITH mapped_courses AS (
      SELECT course_slug FROM knowledge.lesson_concepts
      UNION SELECT course_slug FROM knowledge.question_concepts
      UNION SELECT course_slug FROM knowledge.lab_concepts WHERE course_slug IS NOT NULL
    ), revisions AS MATERIALIZED (
      SELECT c.slug, e.id AS enrollment_id, s.document, t.title AS course_title
      FROM mapped_courses m JOIN public.courses c ON c.slug = m.course_slug
      LEFT JOIN learning.enrollments e ON e.course_id = c.id AND e.student_id = actor
      JOIN LATERAL (
        SELECT v.id FROM public.course_versions v
        WHERE v.course_id = c.id AND v.published_at <= statement_timestamp()
          AND (v.id = e.version_id OR (e.id IS NULL AND c.withdrawn_at IS NULL))
        ORDER BY v.revision DESC LIMIT 1
      ) v ON true
      JOIN public.course_translations t ON t.version_id = v.id AND t.locale = locale_key
      JOIN authoring.snapshots s ON s.version_id = v.id
    ), latest_grades AS MATERIALIZED (
      SELECT DISTINCT ON (a.enrollment_id, a.quiz_id) a.enrollment_id, a.quiz_id, a.answers
      FROM revisions r JOIN learning.attempts a ON a.enrollment_id = r.enrollment_id
      ORDER BY a.enrollment_id, a.quiz_id, a.graded_at DESC, a.id DESC
    ), lesson_links AS (
      SELECT m.concept_id, jsonb_build_object('kind', 'lesson', 'id', m.lesson_id, 'courseSlug', r.slug,
        'title', l->'titles'->>locale_key::text, 'courseTitle', r.course_title, 'enrollmentId', r.enrollment_id,
        'completed', p.completed_at IS NOT NULL) AS item
      FROM revisions r
      CROSS JOIN LATERAL jsonb_array_elements(r.document->'modules') modules(module)
      CROSS JOIN LATERAL jsonb_array_elements(module->'lessons') lessons(l)
      JOIN knowledge.lesson_concepts m ON m.course_slug = r.slug AND m.lesson_id = (l->>'id')::uuid
      LEFT JOIN learning.lesson_progress p ON p.enrollment_id = r.enrollment_id AND p.lesson_id = m.lesson_id
      WHERE l->'titles'->>locale_key::text IS NOT NULL
    ), question_links AS (
      SELECT m.concept_id, jsonb_build_object('kind', 'quiz', 'id', q->>'id', 'courseSlug', r.slug,
        'title', q->'titles'->>locale_key::text, 'courseTitle', r.course_title, 'enrollmentId', r.enrollment_id,
        'total', count(*), 'attempted', a.quiz_id IS NOT NULL, 'correctCount', count(*) FILTER (WHERE
          CASE WHEN a.quiz_id IS NOT NULL THEN learning.assessment_answer(question, a.answers->(question->>'id'), locale_key) ELSE false END)) AS item
      FROM revisions r
      CROSS JOIN LATERAL jsonb_array_elements(r.document->'quizzes') quizzes(q)
      CROSS JOIN LATERAL jsonb_array_elements(q->'questions') questions(question)
      JOIN knowledge.question_concepts m ON m.course_slug = r.slug AND m.question_id = (question->>'id')::uuid
      LEFT JOIN latest_grades a ON a.enrollment_id = r.enrollment_id AND a.quiz_id = (q->>'id')::uuid
      WHERE q->'titles'->>locale_key::text IS NOT NULL
      GROUP BY m.concept_id, r.slug, q, r.course_title, r.enrollment_id, a.quiz_id
    ), guided_links AS (
      SELECT m.concept_id, jsonb_build_object('kind','guided', 'id', m.lab_id, 'courseSlug', r.slug,
        'title', l->'titles'->>locale_key::text, 'courseTitle', r.course_title, 'enrollmentId', r.enrollment_id,
        'review', review.decision,
        'provenance', CASE WHEN review.completion_provenance = 'INSTRUCTOR_REVIEWED' THEN 'INSTRUCTOR_REVIEWED'
          ELSE a.completion_provenance END) AS item
      FROM revisions r
      CROSS JOIN LATERAL jsonb_array_elements(r.document->'guidedLabs') labs(l)
      JOIN knowledge.lab_concepts m ON m.course_slug = r.slug AND m.lab_id = (l->>'id')::uuid
      LEFT JOIN learning.guided_attempts a ON a.enrollment_id = r.enrollment_id AND a.lab_id = m.lab_id
      LEFT JOIN learning.guided_reviews review ON review.attempt_id = a.id
      WHERE l->'titles'->>locale_key::text IS NOT NULL
    ), real_links AS (
      SELECT m.concept_id, jsonb_build_object('kind','real', 'id', m.real_template_version,
        'provenance', CASE WHEN EXISTS (
          SELECT FROM real_lab.attempts a JOIN real_lab.checks c ON c.attempt_id = a.id
          WHERE a.learner_id = actor AND a.template_version = m.real_template_version AND c.completion_provenance = 'SYSTEM_VERIFIED'
        ) THEN 'SYSTEM_VERIFIED' END) AS item
      FROM knowledge.lab_concepts m WHERE m.real_template_version IS NOT NULL
    ), materials AS (
      SELECT * FROM lesson_links UNION ALL SELECT * FROM question_links
      UNION ALL SELECT * FROM guided_links UNION ALL SELECT * FROM real_links
    ), concept_items AS (
      SELECT concept_id, jsonb_agg(item ORDER BY item->>'kind', item->>'courseSlug', item->>'title', item->>'id') AS items
      FROM materials GROUP BY concept_id
    )
    SELECT jsonb_build_object(
      'concepts', coalesce((SELECT jsonb_agg(jsonb_build_object('slug', c.slug, 'track', c.track_slug,
        'titles', jsonb_build_object('en', c.title_en, 'ar', c.title_ar),
        'summaries', jsonb_build_object('en', c.summary_en, 'ar', c.summary_ar),
        'items', coalesce(i.items, '[]'::jsonb)) ORDER BY c.slug)
        FROM knowledge.concepts c LEFT JOIN concept_items i ON i.concept_id = c.id), '[]'::jsonb),
      'edges', coalesce((SELECT jsonb_agg(jsonb_build_object('source', s.slug, 'target', t.slug, 'relation', e.relation_type)
        ORDER BY s.slug, t.slug, e.relation_type) FROM knowledge.concept_edges e
        JOIN knowledge.concepts s ON s.id = e.source_concept_id
        JOIN knowledge.concepts t ON t.id = e.target_concept_id), '[]'::jsonb)
    )
  );
END;
$evidence$;
--> statement-breakpoint
ALTER FUNCTION knowledge.learner_evidence(text,public.course_locale) OWNER TO academy_mastery_definer;
REVOKE ALL ON FUNCTION knowledge.learner_evidence(text,public.course_locale) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION knowledge.learner_evidence(text,public.course_locale) TO academy_learner_runtime;
