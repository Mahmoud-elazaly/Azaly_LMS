import { sql } from 'drizzle-orm';
import { database } from '@/db/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await database().execute(sql`
      select 1 from public.courses, public.course_versions, public.course_translations limit 0
    `);
    return Response.json({ status: 'ready' }, { headers });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503, headers });
  }
}
