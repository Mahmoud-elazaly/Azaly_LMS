import { Client, type ClientBase } from 'pg';
import type { BankQuestion } from '../features/assessment/policy';
import type { CourseDocument } from '../features/authoring/policy';

type Seed = {
  id: string;
  document: CourseDocument;
  questions: BankQuestion[];
};
type Stage = 'draft' | 'publish';

async function findAuthor(client: ClientBase, email: string | undefined) {
  const { rows } = await client.query<{ id: string }>(`
    SELECT id FROM identity."user"
    WHERE NOT banned AND (
      ($1::text IS NULL AND role = 'OWNER')
      OR (email = $1 AND role IN ('OWNER', 'ADMIN', 'INSTRUCTOR'))
    ) FOR SHARE
  `, [email ?? null]);
  if (rows.length !== 1) throw new Error('Choose one active course author with --author <email>.');
  return rows[0].id;
}

async function stageDraft(client: ClientBase, seed: Seed, actor: string) {
  const questions = seed.questions.map(({ id, tags, translations, correct }) =>
    ({ id, question: { tags, translations, correct } }));
  await client.query('INSERT INTO public.courses (id, slug) VALUES ($1, $2)', [seed.id, seed.document.slug]);
  await client.query('INSERT INTO authoring.drafts (course_id, owner_id, document) VALUES ($1, $2, $3)',
    [seed.id, actor, seed.document]);
  await client.query(`
    INSERT INTO authoring.bank_questions (id, owner_id, question)
    SELECT entry.id, $1, entry.question FROM jsonb_to_recordset($2) AS entry(id uuid, question jsonb)
  `, [actor, JSON.stringify(questions)]);
}

async function publishDraft(client: ClientBase, seed: Seed, actor: string) {
  const { rows: [version] } = await client.query<{ id: string }>(`
    INSERT INTO public.course_versions (course_id, revision, published_at)
    VALUES ($1, 1, clock_timestamp()) RETURNING id
  `, [seed.id]);
  await client.query(`
    INSERT INTO authoring.snapshots (version_id, document)
    SELECT $2, document FROM authoring.drafts WHERE course_id = $1
  `, [seed.id, version.id]);
  await client.query(`
    INSERT INTO public.course_translations (version_id, locale, title, summary)
    SELECT $1, translation.key::public.course_locale, translation.value->>'title', translation.value->>'summary'
    FROM jsonb_each($2) AS translation
  `, [version.id, seed.document.translations]);
  await client.query('UPDATE public.courses SET catalog_position = $2 WHERE id = $1', [seed.id, seed.document.position]);
  await client.query('UPDATE authoring.drafts SET edit_version = edit_version + 1 WHERE course_id = $1', [seed.id]);
  await client.query(`
    INSERT INTO authoring.events (course_id, version_id, actor_id, action) VALUES ($1, $2, $3, 'publish')
  `, [seed.id, version.id, actor]);
}

async function inspectExistingCourse(client: ClientBase, seed: Seed, actor: string) {
  // Normal authoring writes take the same draft lock before publishing or changing visibility.
  const { rows: [draft] } = await client.query<{ matches_seed: boolean }>(`
    SELECT (c.slug = $2 AND d.owner_id IS NOT DISTINCT FROM $3 AND d.archived_at IS NULL
      AND c.withdrawn_at IS NULL AND d.document = $4::jsonb) AS matches_seed
    FROM authoring.drafts d JOIN public.courses c ON c.id = d.course_id
    WHERE d.course_id = $1 FOR UPDATE OF d
  `, [seed.id, seed.document.slug, actor, seed.document]);
  const { rows: versions } = await client.query<{ seed_published: boolean }>(`
    SELECT (v.revision = 1 AND v.published_at IS NOT NULL
      AND s.document IS NOT DISTINCT FROM $2::jsonb) AS seed_published
    FROM public.course_versions v LEFT JOIN authoring.snapshots s ON s.version_id = v.id
    WHERE v.course_id = $1
  `, [seed.id, seed.document]);
  if (versions.some(({ seed_published }) => seed_published)) return 'published';
  if (versions.length || (draft && !draft.matches_seed)) {
    throw new Error('Existing course content differs from this seed. Review it in the course builder.');
  }
  return draft ? 'draft' : 'absent';
}

async function applySeed(client: ClientBase, seed: Seed, stage: Stage, actor: string) {
  const existing = await inspectExistingCourse(client, seed, actor);
  if (existing === 'published') return 'Seed publication already recorded.';
  if (stage === 'draft') {
    if (existing === 'draft') return 'Curated course draft already exists.';
    await stageDraft(client, seed, actor);
    return 'Curated course draft created.';
  }
  if (existing === 'absent') throw new Error('Stage and review the course draft before publishing.');
  await publishDraft(client, seed, actor);
  return 'Curated course published as revision 1.';
}

// The deployment job owns these tables. Runtime publication commands still require a signed-in author.
export async function seedCourse(connectionString: string, seed: Seed, stage: Stage, email?: string) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
  try {
    await client.connect();
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL search_path = pg_catalog');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [seed.id]);
      const actor = await findAuthor(client, email);
      const message = await applySeed(client, seed, stage, actor);
      await client.query('COMMIT');
      return message;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}
