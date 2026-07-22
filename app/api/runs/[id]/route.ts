import { getRunMeta, getComparison, saveRunMeta } from '@/lib/store';
import { reconcileStale } from '@/lib/reconcile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = await reconcileStale(await getRunMeta(id));
  if (!meta) return Response.json({ error: 'Run not found' }, { status: 404 });
  const comparison = await getComparison(id);
  return Response.json({ meta, comparison });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.passed)) {
    return Response.json({ error: 'Expected { passed: number[] }' }, { status: 400 });
  }
  const meta = await getRunMeta(id);
  if (!meta) return Response.json({ error: 'Run not found' }, { status: 404 });
  meta.passed = (body.passed as unknown[]).filter((n): n is number => typeof n === 'number');
  await saveRunMeta(meta);
  return Response.json({ ok: true });
}
