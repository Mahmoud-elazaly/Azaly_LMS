import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { z } from 'zod';
import { readDatabaseUrl } from '../../db/env';
import { account, session, user, verification } from '../../db/identity-schema';
import { reportAuthFailure } from './diagnostics';

const environment = z.object({
  BETTER_AUTH_URL: z.url().refine((value) => {
    const url = new URL(value);
    return url.origin === value.replace(/\/$/, '') &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
  }),
  BETTER_AUTH_SECRET: z.string().min(32),
  AUTH_DATABASE_URL: z.string().min(1),
});

const ac = createAccessControl({ user: ['list', 'get', 'set-role'] });
const pluginRoles = {
  OWNER: ac.newRole({ user: ['list', 'get', 'set-role'] }),
  ADMIN: ac.newRole({ user: ['list', 'get'] }),
  INSTRUCTOR: ac.newRole({}),
  STUDENT: ac.newRole({}),
};

function createAuth() {
  const config = environment.safeParse(process.env);
  if (!config.success) throw new Error('Authentication environment is missing or invalid.');
  const origin = new URL(config.data.BETTER_AUTH_URL).origin;
  const connectionString = readDatabaseUrl({ DATABASE_URL: config.data.AUTH_DATABASE_URL });
  const pool = new Pool({ connectionString, max: 8, connectionTimeoutMillis: 2500 });
  pool.on('error', () => console.error('An idle authentication database connection failed.'));

  const db = drizzle(pool);
  return {
    origin, db,
    auth: betterAuth({
      baseURL: origin,
      secret: config.data.BETTER_AUTH_SECRET,
      trustedOrigins: [origin],
      database: drizzleAdapter(db, {
        provider: 'pg',
        schema: { account, session, user, verification },
        transaction: true,
      }),
      emailAndPassword: { enabled: true, autoSignIn: false, minPasswordLength: 12, maxPasswordLength: 128 },
      session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
      advanced: {
        useSecureCookies: origin.startsWith('https:'),
        defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
        ipAddress: { ipAddressHeaders: ['x-academy-client-ip'] },
      },
      rateLimit: {
        enabled: true,
        storage: 'memory',
        customRules: {
          '/sign-in/email': { window: 60, max: 8 },
          '/sign-up/email': { window: 600, max: 5 },
        },
      },
      logger: { disabled: true },
      onAPIError: {
        onError(error) {
          const status = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
          if (typeof status !== 'number' || status >= 500) reportAuthFailure('Better Auth handler', error);
        },
      },
      plugins: [admin({ ac, roles: pluginRoles, defaultRole: 'STUDENT', adminRoles: ['OWNER', 'ADMIN'] })],
    }),
  };
}

let instance: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  return instance ??= createAuth();
}
