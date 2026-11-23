import { checkCatalogAccess } from '@/db/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await checkCatalogAccess();
    return Response.json({ status: 'ready' }, { headers });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503, headers });
  }
}
