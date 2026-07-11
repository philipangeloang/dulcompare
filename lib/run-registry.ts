import type { RunProgress } from '@/lib/types';

type Entry = { last: RunProgress; subs: Set<(p: RunProgress) => void>; done: boolean };
const runs = new Map<string, Entry>();

function ensure(id: string): Entry {
  let e = runs.get(id);
  if (!e) { e = { last: { phase: 'capture' }, subs: new Set(), done: false }; runs.set(id, e); }
  return e;
}

// A dead/closed SSE connection can throw from its callback; isolate each call
// so one broken subscriber can never propagate up into the runner's
// `await emit(...)` and mark the whole run errored.
function notify(subs: Set<(p: RunProgress) => void>, progress: RunProgress): void {
  for (const cb of subs) {
    try { cb(progress); } catch { /* subscriber is responsible for unsubscribing */ }
  }
}

export function emit(id: string, progress: RunProgress): void {
  const e = ensure(id);
  e.last = progress;
  notify(e.subs, progress);
}

export function subscribe(id: string, cb: (p: RunProgress) => void): () => void {
  const e = ensure(id);
  e.subs.add(cb);
  return () => { e.subs.delete(cb); };
}

export function getLast(id: string): RunProgress | undefined {
  return runs.get(id)?.last;
}

export function isDone(id: string): boolean {
  return runs.get(id)?.done ?? false;
}

export function setDone(id: string): void {
  const e = ensure(id);
  e.done = true;
  e.last = { phase: 'done' };
  notify(e.subs, e.last);
}
