import { listPresets, upsertPreset } from '@/lib/store';
import type { Preset } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(await listPresets());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Preset | null;
  if (!body?.id || !body?.name || (body.suite !== 'seo' && body.suite !== 'datalayer') || !Array.isArray(body.pages)) {
    return Response.json({ error: 'Invalid preset: need id, name, suite (seo|datalayer), pages[]' }, { status: 400 });
  }
  await upsertPreset(body);
  return Response.json({ ok: true });
}
