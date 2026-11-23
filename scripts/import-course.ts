import { parseArgs } from 'node:util';
import { importCourseDraft } from '../src/db/course-import.ts';
import { prepareCourseImport } from '../src/features/importer/course.ts';
import { ImportError } from '../src/features/importer/sources.ts';

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { 'dry-run': { type: 'boolean' }, apply: { type: 'boolean' }, slug: { type: 'string' }, locale: { type: 'string' } },
  });
  if (positionals.length !== 1 || (values.apply && values['dry-run']) ||
      (values.locale !== undefined && values.locale !== 'ar' && values.locale !== 'en')) {
    throw new ImportError('invalid_arguments');
  }
  const { document, warnings } = await prepareCourseImport(positionals[0], { slug: values.slug, locale: values.locale });
  const summary = {
    slug: document.slug, modules: document.modules.length,
    lessons: document.modules.reduce((total, module) => total + module.lessons.length, 0),
    quizzes: document.quizzes?.length ?? 0, warnings,
  };
  if (!values.apply) {
    console.log(JSON.stringify({ status: 'validated', ...summary }));
    return;
  }
  const token = process.env.COURSE_IMPORT_SESSION_TOKEN;
  if (!token) throw new ImportError('missing_session');
  console.log(JSON.stringify({ ...await importCourseDraft(document, token), ...summary }));
}

main().catch((error: unknown) => {
  const sqlCode = error instanceof Error && 'code' in error ? error.code : undefined;
  const result = error instanceof ImportError ? { code: error.code, path: error.path }
    : { code: sqlCode === '42501' ? 'access_denied' : sqlCode === '40001' || sqlCode === '23505' ? 'draft_conflict'
      : sqlCode === '22023' ? 'invalid_course' : sqlCode === 'ENOENT' ? 'missing_input'
        : typeof sqlCode === 'string' && sqlCode.startsWith('ERR_PARSE_ARGS_') ? 'invalid_arguments' : 'import_failed' };
  console.error(JSON.stringify({ error: result }));
  process.exitCode = 1;
});
