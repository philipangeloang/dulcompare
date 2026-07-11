import { getRunMeta, getComparison } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = await getRunMeta(id);
  if (!meta) return Response.json({ error: 'Run not found' }, { status: 404 });
  const comparison = await getComparison(id);
  return Response.json({ meta, comparison });
}
