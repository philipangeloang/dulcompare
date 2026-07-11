import { subscribe, getLast, isDone } from '@/lib/run-registry';
import { getRunMeta } from '@/lib/store';
import type { RunProgress } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const encoder = new TextEncoder();
  const frame = (p: RunProgress) => encoder.encode(`data: ${JSON.stringify(p)}\n\n`);

  let closed = false;
  let unsub: (() => void) | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      // Guarded enqueue: once the client disconnects (cancel) or the run is
      // done, the controller is closed and enqueue would throw. Swallowing it
      // here keeps a dead connection from crashing the run via the registry.
      const send = (p: RunProgress) => {
        if (closed) return;
        try {
          controller.enqueue(frame(p));
        } catch {
          closed = true;
        }
      };

      // Initial state: registry if in-flight, else the persisted meta's progress/status.
      const last = getLast(id);
      if (last) {
        send(last);
      } else {
        const meta = await getRunMeta(id);
        if (meta) send(meta.status === 'running' ? meta.progress : { phase: 'done' });
      }
      // If the run already finished before we subscribed, close now.
      if (isDone(id) || !getLast(id)) {
        const meta = await getRunMeta(id);
        if (!meta || meta.status !== 'running') {
          closed = true;
          controller.close();
          return;
        }
      }
      unsub = subscribe(id, (p) => {
        send(p);
        if (p.phase === 'done') {
          unsub?.();
          unsub = undefined;
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      });
    },
    cancel() {
      // Client disconnected (tab closed / navigated away). Unsubscribe so the
      // registry never enqueues onto a cancelled controller.
      closed = true;
      unsub?.();
      unsub = undefined;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
