import { crc32, deflateRawSync } from 'node:zlib';

type Entry = readonly [string, string | Buffer];

export function courseZip(entries: readonly Entry[]) {
  const files: Buffer[] = [];
  const index: Buffer[] = [];
  let offset = 0;
  for (const [name, input] of entries) {
    const path = Buffer.from(name);
    const content = typeof input === 'string' ? Buffer.from(input) : input;
    const compressed = deflateRawSync(content);
    const sum = crc32(content);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(sum, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(path.length, 26);
    files.push(header, path, compressed);

    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x800, 8);
    record.writeUInt16LE(8, 10);
    record.writeUInt32LE(sum, 16);
    record.writeUInt32LE(compressed.length, 20);
    record.writeUInt32LE(content.length, 24);
    record.writeUInt16LE(path.length, 28);
    record.writeUInt32LE(offset, 42);
    index.push(record, path);
    offset += header.length + path.length + compressed.length;
  }

  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50);
  footer.writeUInt16LE(entries.length, 8);
  footer.writeUInt16LE(entries.length, 10);
  footer.writeUInt32LE(index.reduce((length, record) => length + record.length, 0), 12);
  footer.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, ...index, footer]);
}

export const fixtureSlug = 'phase-eight-diagrams';
const fences = '~~~';

export function archiveEntries(marker = 'Published lesson text'): Entry[] {
  const diagram = [
    fences + 'mermaid', 'flowchart LR', '  learner[Learner] --> lesson[Lesson]', fences, '',
    fences + 'mermaid', 'this cannot parse as a diagram', fences, '',
    fences + 'bash', 'echo "practice"', fences,
  ].join('\n');
  return [
    ['course.json', JSON.stringify({
      slug: fixtureSlug,
      translations: { en: { title: 'Diagram study', summary: 'Read diagrams and practice commands.' },
        ar: { title: 'دراسة المخططات', summary: 'اقرأ المخططات وتدرّب على الأوامر.' } },
      modules: [{ key: 'fundamentals', titles: { en: 'Fundamentals', ar: 'الأساسيات' }, lessons: [{
        key: 'read-a-diagram', titles: { en: 'Read a diagram', ar: 'قراءة مخطط' },
        markdown: { en: 'lessons/diagram.en.md', ar: 'lessons/diagram.ar.md' },
      }] }],
      quizzes: ['practice', 'missing'],
    })],
    ['lessons/diagram.en.md', marker + '\n\n' + diagram],
    ['lessons/diagram.ar.md', 'اقرأ مسار الدرس.\n\n' + diagram],
    ['quizzes/practice.quiz.json', JSON.stringify({
      titles: { en: 'Diagram exercises', ar: 'تمارين المخطط' },
      questions: [
        { key: 'bug', type: 'find_bug', language: 'yaml', snippet: 'version: 1\ncolour: blu\nport: -1',
          translations: { en: { prompt: 'Which configuration lines need repair?', explanation: 'PRIVATE BUG EXPLANATION' },
            ar: { prompt: 'أي أسطر الإعداد تحتاج إلى تصحيح؟', explanation: 'شرح داخلي للمؤلف' } } },
        { key: 'recall', type: 'cli_recall',
          translations: { en: { prompt: 'Recall the workspace check.', explanation: 'PRIVATE CLI EXPLANATION' },
            ar: { prompt: 'استدعِ أمر فحص مساحة العمل.', explanation: 'شرح داخلي للمؤلف' } } },
      ],
    })],
    ['quizzes/practice.answers.json', JSON.stringify({
      bug: { faultyLines: [2, 3] },
      recall: { rule: { mode: 'flags', value: 'workspace check --target=sample --fast' } },
    })],
    ['quizzes/missing.quiz.json', '{}'],
    ['.git/config', 'ignore'],
    ['node_modules/dependency/data.json', '{}'],
    ['__MACOSX/metadata.md', 'ignore'],
    ['.DS_Store', Buffer.from([0, 1])],
    ['bundle.png', Buffer.from([137, 80, 78, 71])],
    ['unused.md', 'Unmapped course material'],
  ];
}
