import { deletePreset } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return Response.json({ error: 'Missing preset id' }, { status: 400 });
  await deletePreset(id);
  return Response.json({ ok: true });
}
