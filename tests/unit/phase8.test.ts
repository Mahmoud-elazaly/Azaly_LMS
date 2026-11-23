import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bankContent, importBankQuestion } from '../../src/features/assessment/policy';
import { prepareCourseImport } from '../../src/features/importer/course';
import { learnerInput } from '../../src/features/learning/policy';
import { archiveEntries, courseZip } from '../fixtures/phase8-archive';

const translations = {
  en: { prompt: 'Locate the problem', explanation: 'The rule is private.' },
  ar: { prompt: 'حدد المشكلة', explanation: 'القاعدة خاصة.' },
};

describe('extended assessment policy', () => {
  it('retains an independent copied line key and rejects duplicate and out-of-range lines', () => {
    const bug = { type: 'find_bug', language: 'yaml', snippet: 'ok: true\r\nbroken: yes', translations, tags: [], faultyLines: [2] };
    const data = bankContent.parse(bug);
    if (data.type !== 'find_bug') throw new Error('Expected a line-selection question');
    const question = { ...data, id: randomUUID(), archived: false, version: 1 };
    const occurrence = importBankQuestion(question, randomUUID());
    question.faultyLines[0] = 1;
    expect(occurrence).toMatchObject({ type: 'find_bug', faultyLines: [2] });
    expect(bankContent.safeParse({ ...bug, faultyLines: [2, 2] }).success).toBe(false);
    expect(bankContent.safeParse({ ...bug, faultyLines: [3] }).success).toBe(false);
  });

  it.each(['[', '(?=secret)', '(x)\\1'])('rejects invalid or unsupported recall rubric %s', (value) => {
    expect(bankContent.safeParse({
      translations, tags: [], type: 'cli_recall', rule: { mode: 'regex', value },
    }).success).toBe(false);
  });

  it('accepts mixed answer shapes and rejects extra grading data', () => {
    const submission = {
      operation: 'submit', id: randomUUID(), quizId: randomUUID(), attemptId: randomUUID(), locale: 'ar',
      answers: { [randomUUID()]: 1, [randomUUID()]: [2, 3], [randomUUID()]: 'kubectl get pods' },
    };
    expect(learnerInput.safeParse(submission).success).toBe(true);
    expect(learnerInput.safeParse({ ...submission, score: 3 }).success).toBe(false);
    expect(learnerInput.safeParse({ ...submission, answers: { [randomUUID()]: 'shell\ncommand' } }).success).toBe(false);
  });
});

describe('offline course import validation', () => {
  let directory: string;
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'lms-import-')); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  async function archive(name: string, entries = archiveEntries()) {
    const path = join(directory, name);
    await writeFile(path, courseZip(entries));
    return path;
  }

  it('produces the same bilingual draft and warnings when ZIP entry order changes', async () => {
    const first = await prepareCourseImport(await archive('first.zip'));
    const second = await prepareCourseImport(await archive('second.zip', archiveEntries().reverse()));
    expect(first).toEqual(second);
    expect(first.document.modules[0].lessons[0].blocks[0]).toMatchObject({ type: 'markdown' });
    expect(first.document.quizzes?.[0].questions.map(({ type }) => type)).toEqual(['find_bug', 'cli_recall']);
    expect(first.warnings).toEqual([
      { code: 'ignored_path', path: '.DS_Store' }, { code: 'ignored_path', path: '.git/config' },
      { code: 'ignored_path', path: '__MACOSX/metadata.md' }, { code: 'ignored_binary', path: 'bundle.png' },
      { code: 'ignored_path', path: 'node_modules/dependency/data.json' },
      { code: 'unmatched_quiz_pair', path: 'quizzes/missing.answers.json' },
      { code: 'unmapped_file', path: 'unused.md' },
    ]);
  });

  it('validates standalone Markdown and rejects a ZIP traversal path', async () => {
    const path = join(directory, 'lesson.md');
    await writeFile(path, '# Standalone lesson\n\nRead this.');
    const { document } = await prepareCourseImport(path, { slug: 'standalone', locale: 'en' });
    expect(document.modules[0].lessons[0].blocks[0].translations).toEqual({ en: 'Read this.' });
    await expect(prepareCourseImport(await archive('unsafe.zip', [...archiveEntries(), ['../escape.md', 'no']])))
      .rejects.toMatchObject({ code: 'invalid_zip' });
  });

  it('skips a quiz when the answer file keys do not pair with its questions', async () => {
    const entries = archiveEntries().map(([path, value]) =>
      [path, path === 'quizzes/practice.answers.json' ? '{"other":{"correct":0}}' : value] as const);
    const result = await prepareCourseImport(await archive('unpaired.zip', entries));
    expect(result.document.quizzes).toBeUndefined();
    expect(result.warnings).toContainEqual({ code: 'unmatched_quiz_pair', path: 'quizzes/practice.answers.json' });
  });
});
