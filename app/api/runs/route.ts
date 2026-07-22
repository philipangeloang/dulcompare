import { startRun } from '@/lib/runner';
import { listRuns } from '@/lib/store';
import { reconcileStale } from '@/lib/reconcile';
import type { Suite } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validUrl(u: unknown): u is string {
  if (typeof u !== 'string') return false;
  try {
    const p = new URL(u);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  const { suite, siteA, siteB, presetId } = body;
  if (suite !== 'seo' && suite !== 'datalayer')
    return Response.json({ error: 'suite must be "seo" or "datalayer"' }, { status: 400 });
  if (!siteA?.label || !validUrl(siteA?.baseURL))
    return Response.json({ error: 'Site A needs a label and a valid http(s) base URL' }, { status: 400 });
  if (!siteB?.label || !validUrl(siteB?.baseURL))
    return Response.json({ error: 'Site B needs a label and a valid http(s) base URL' }, { status: 400 });
  if (typeof presetId !== 'string' || !presetId)
    return Response.json({ error: 'presetId is required' }, { status: 400 });
  try {
    const id = await startRun({ suite: suite as Suite, siteA, siteB, presetId });
    return Response.json({ id });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function GET() {
  // Flip any run orphaned by a server restart from "running" to "error" so the
  // history list doesn't show a spinner that will never resolve.
  const runs = await Promise.all((await listRuns()).map((m) => reconcileStale(m)));
  return Response.json(runs.filter((m) => m !== null));
}
