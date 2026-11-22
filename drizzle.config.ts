import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'drizzle-kit';
import { readDatabaseUrl } from './src/db/env';

loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/db/schema.ts', './src/db/identity-schema.ts'],
  out: './src/db/migrations',
  ...(process.env.DATABASE_URL && { dbCredentials: { url: readDatabaseUrl() } }),
});
