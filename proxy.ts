import { NextResponse, type NextRequest } from 'next/server';
import { isLocale } from './src/i18n/locales';

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const locale = request.nextUrl.pathname.split('/')[1];
  if (request.method === 'GET' && request.headers.get('sec-fetch-dest') === 'document' &&
      isLocale(locale) && request.cookies.get('academy-locale')?.value !== locale) {
    response.cookies.set('academy-locale', locale, {
      path: '/', maxAge: 31_536_000, httpOnly: true, sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https',
    });
  }
  return response;
}

export const config = { matcher: ['/ar/:path*', '/en/:path*'] };
