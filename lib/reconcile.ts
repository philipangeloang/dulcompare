import type { RunMeta } from '@/lib/types';
import { saveRunMeta } from '@/lib/store';

/**
 * A run executes in the server's memory (startRun is fire-and-forget). If the
 * process restarts or hot-reloads mid-run — trivially easy in `next dev`, where
 * saving any file triggers a recompile — the job dies, but its meta.json is left
 * saying "running" forever. The UI then streams nothing and polls indefinitely.
 *
 * The runner bumps `updatedAt` on every page emit, so a live run heartbeats and a
 * dead one goes silent. Anything still "running" with no heartbeat for this long
 * is treated as orphaned and flipped to `error` so the UI stops waiting.
 *
 * Generous on purpose: a single dataLayer page (networkidle + scroll + scripted
 * interactions) can legitimately take a couple of minutes. A false positive is
 * self-correcting anyway — the live runner holds its own meta object and will
 * overwrite the status on its next emit.
 */
const STALE_MS = 5 * 60 * 1000;

export async function reconcileStale(meta: RunMeta | null): Promise<RunMeta | null> {
  if (!meta || meta.status !== 'running') return meta;

  const last = Date.parse(meta.updatedAt ?? meta.createdAt);
  if (Number.isNaN(last) || Date.now() - last < STALE_MS) return meta;

  meta.status = 'error';
  meta.error =
    'Run was interrupted — no progress for over 5 minutes. The server most likely restarted ' +
    'or recompiled (saving a file during `next dev` is enough) while the capture was in flight. ' +
    'Nothing is still running; start a new comparison.';
  await saveRunMeta(meta);
  return meta;
}
