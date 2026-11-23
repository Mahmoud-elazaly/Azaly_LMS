import { parseArgs } from 'node:util';
import { readDatabaseUrl } from '../src/db/env.ts';
import { seedCourse } from '../src/db/seed-course.ts';
import { bankQuestions, courseDocument, courseId } from '../src/features/curriculum/prometheus-grafana/course.ts';

try {
  const { positionals: [stage, ...rest], values: { author } } = parseArgs({
    allowPositionals: true,
    options: { author: { type: 'string' } },
  });
  if (!['draft', 'publish'].includes(stage) || rest.length || (author !== undefined && !author.trim())) {
    throw new Error('Usage: pnpm db:seed:prometheus-grafana draft|publish [--author <email>]');
  }
  console.log(await seedCourse(readDatabaseUrl(), {
    id: courseId, document: courseDocument, questions: bankQuestions,
  }, stage, author?.trim().toLowerCase()));
} catch (error) {
  if (error?.code === '23505') {
    console.error('The course slug or a seed ID is already in use. Existing content was preserved.');
  } else {
    console.error(error instanceof Error && !error.code ? error.message : 'Course seed database operation failed.');
  }
  process.exitCode = 1;
}
