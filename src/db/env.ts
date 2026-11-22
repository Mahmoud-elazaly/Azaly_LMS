import { z } from 'zod';

const databaseUrl = z.url({ protocol: /^postgres(?:ql)?$/ }).refine((value) => {
  const url = new URL(value);
  return Boolean(url.hostname && url.username && url.pathname.length > 1);
});

export function readDatabaseUrl(
  env: { DATABASE_URL?: string } = { DATABASE_URL: process.env.DATABASE_URL },
): string {
  const result = databaseUrl.safeParse(env.DATABASE_URL);
  if (!result.success) {
    throw new Error('DATABASE_URL must be a PostgreSQL URL with a host, user and database.');
  }
  return result.data;
}
