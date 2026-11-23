'use server';

import { cookies, headers } from 'next/headers';
import { parseTheme } from './theme';

export async function saveTheme(form: FormData) {
  const theme = parseTheme(form.get('theme'));
  const secure = (await headers()).get('x-forwarded-proto') === 'https';
  (await cookies()).set('academy-theme', theme, {
    path: '/', maxAge: 31_536_000, httpOnly: true, sameSite: 'lax', secure,
  });
}
