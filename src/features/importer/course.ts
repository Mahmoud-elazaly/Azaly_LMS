import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canPublish, documentSchema, slug, type CourseDocument } from '../authoring/policy.ts';
import { draftQuestion } from '../assessment/policy.ts';
import { ImportError, readImportSources, safePath, type ImportWarning } from './sources.ts';

const locales = ['ar', 'en'] as const;
const title = z.string().trim().min(1).max(160);
const localized = <T extends z.ZodType>(value: T) => z.strictObject({ ar: value.optional(), en: value.optional() });
const markdownPath = z.string().refine((path) => path.endsWith('.md') && safePath(path));
const manifest = z.strictObject({
  slug, position: z.number().int().min(0).max(100000).default(0),
  translations: localized(z.strictObject({ title, summary: z.string().trim().min(1).max(3000) })),
  modules: z.array(z.strictObject({
    key: slug, titles: localized(title), lessons: z.array(z.strictObject({
      key: slug, titles: localized(title), markdown: localized(markdownPath),
    })).min(1).max(40),
  })).min(1).max(40),
  quizzes: z.array(slug).max(10).default([]),
});
const quizSchema = z.strictObject({
  titles: localized(title),
  questions: z.array(z.looseObject({ key: slug })).min(1).max(20),
});
const answerKey = z.record(slug, z.record(z.string(), z.unknown()));

function stableId(...path: string[]) {
  const bytes = createHash('sha256').update(JSON.stringify(path)).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

function parseJson<T>(schema: z.ZodType<T>, text: string | undefined, path: string) {
  if (text === undefined) throw new ImportError('missing_file', path);
  try {
    return schema.parse(JSON.parse(text));
  } catch {
    throw new ImportError('invalid_file', path);
  }
}

type Quiz = NonNullable<CourseDocument['quizzes']>[number];

function parseQuiz(files: Map<string, string>, quizKey: string, courseSlug: string, warnings: ImportWarning[]) {
  const quizPath = `quizzes/${quizKey}.quiz.json`;
  const answerPath = `quizzes/${quizKey}.answers.json`;
  const quizFile = files.get(quizPath);
  const answerFile = files.get(answerPath);
  files.delete(quizPath);
  files.delete(answerPath);
  if (quizFile === undefined || answerFile === undefined) {
    warnings.push({ code: 'unmatched_quiz_pair', path: quizFile === undefined ? quizPath : answerPath });
    return null;
  }

  const { titles, questions } = parseJson(quizSchema, quizFile, quizPath);
  const answers = parseJson(answerKey, answerFile, answerPath);
  const expected = new Set(questions.map(({ key }) => key));
  if (expected.size !== questions.length) throw new ImportError('duplicate_quiz_question', quizPath);
  if (Object.keys(answers).length !== expected.size || [...expected].some((key) => !Object.hasOwn(answers, key))) {
    warnings.push({ code: 'unmatched_quiz_pair', path: answerPath });
    return null;
  }

  const parsed = questions.map(({ key, ...question }) => {
    const field = question.type === 'find_bug' ? 'faultyLines' : question.type === 'cli_recall' ? 'rule' : 'correct';
    if (['id', 'bankSource', 'correct', 'rule', 'faultyLines'].some((name) => Object.hasOwn(question, name)) ||
        Object.keys(answers[key]).length !== 1 || !Object.hasOwn(answers[key], field)) {
      throw new ImportError('invalid_answer_pair', answerPath);
    }
    const result = draftQuestion.safeParse({ ...question, id: stableId(courseSlug, 'quiz', quizKey, key), [field]: answers[key][field] });
    if (!result.success) throw new ImportError('invalid_question', quizPath);
    return result.data;
  });
  return { id: stableId(courseSlug, 'quiz', quizKey), titles, questions: parsed } satisfies Quiz;
}

function archiveCourse(files: Map<string, string>, warnings: ImportWarning[]) {
  const course = parseJson(manifest, files.get('course.json'), 'course.json');
  files.delete('course.json');
  const { slug, position, translations } = course;
  const modules = course.modules.map(({ key, titles, lessons }) => ({
    id: stableId(slug, 'module', key), titles,
    lessons: lessons.map((lesson) => {
      const translations: Record<string, string> = {};
      for (const locale of locales) {
        const path = lesson.markdown[locale];
        if (!path) continue;
        const body = files.get(path);
        if (body === undefined) throw new ImportError('missing_or_repeated_markdown', path);
        files.delete(path);
        translations[locale] = body.trim();
      }
      return { id: stableId(slug, 'lesson', key, lesson.key), titles: lesson.titles,
        blocks: [{ id: stableId(slug, 'markdown', key, lesson.key), type: 'markdown', translations }] };
    }),
  }));
  if (new Set(course.quizzes).size !== course.quizzes.length) throw new ImportError('duplicate_quiz', 'course.json');
  const quizzes = course.quizzes.map((key) => parseQuiz(files, key, slug, warnings)).filter((quiz) => quiz !== null);
  for (const path of files.keys()) {
    const pair = /^(quizzes\/[a-z0-9-]+)\.(quiz|answers)\.json$/.exec(path);
    const other = pair ? `${pair[1]}.${pair[2] === 'quiz' ? 'answers' : 'quiz'}.json` : null;
    warnings.push({ code: other && !files.has(other) ? 'unmatched_quiz_pair' : 'unmapped_file', path });
  }
  return { slug, position, translations, modules, ...(quizzes.length ? { quizzes } : {}) };
}

function standaloneCourse(markdown: string, options: { slug?: string; locale?: typeof locales[number] }) {
  const parsedSlug = slug.safeParse(options.slug);
  const locale = options.locale;
  if (!parsedSlug.success || !locale) throw new ImportError('markdown_requires_slug_and_locale');
  const courseSlug = parsedSlug.data;
  const heading = /^#[ \t]+([^\n]+)\n/.exec(markdown.trimStart());
  const name = title.safeParse(heading?.[1]);
  if (!heading || !name.success) throw new ImportError('missing_markdown_title');
  const body = markdown.trimStart().slice(heading[0].length).trim();
  const block = { id: stableId(courseSlug, 'markdown'), type: 'markdown', translations: { [locale]: body } };
  const titles = { [locale]: name.data };
  return { slug: courseSlug, position: 0, translations: { [locale]: { title: name.data, summary: name.data } },
    modules: [{ id: stableId(courseSlug, 'module'), titles,
      lessons: [{ id: stableId(courseSlug, 'lesson'), titles, blocks: [block] }] }] };
}

export async function prepareCourseImport(path: string, options: { slug?: string; locale?: 'ar' | 'en' } = {}) {
  const { markdown, files, warnings } = await readImportSources(path);
  if (markdown === undefined && (options.slug !== undefined || options.locale !== undefined)) {
    throw new ImportError('zip_uses_manifest');
  }
  const raw = markdown === undefined ? archiveCourse(files, warnings) : standaloneCourse(markdown, options);
  const result = documentSchema.safeParse(raw);
  if (!result.success || !canPublish(result.data)) throw new ImportError('invalid_course');
  warnings.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { document: result.data, warnings };
}
