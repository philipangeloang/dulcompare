"use client";

import { useEffect, useRef, useState } from "react";
import type { RunMeta, RunProgress as RunProgressData } from "@/lib/types";

const POLL_INTERVAL_MS = 1500;
// If no SSE frame arrives within this window, treat the stream as stuck and
// fall back to polling. This covers not just onerror (connection reset) but
// also the case where a fresh EventSource connects fine to a server process
// that has no in-memory progress for this run id (e.g. opened after a
// restart) — the stream stays open and silent forever without ever erroring.
const STALL_TIMEOUT_MS = 20000;

type StageKey = "capture-a" | "capture-b" | "compare";

const STAGES: { key: StageKey; label: string }[] = [
  { key: "capture-a", label: "Capture A" },
  { key: "capture-b", label: "Capture B" },
  { key: "compare", label: "Compare" },
];

function stageIndex(p: RunProgressData): number {
  if (p.phase === "compare" || p.phase === "done") return 2;
  if (p.site === "B") return 1;
  return 0;
}

function phaseLabel(p: RunProgressData): string {
  if (p.phase === "compare") return "Comparing…";
  if (p.phase === "done") return "Finishing…";
  if (p.site === "B") return "Capturing Site B";
  if (p.site === "A") return "Capturing Site A";
  return "Starting capture…";
}

/**
 * Live progress for a running comparison. Subscribes to the SSE stream and
 * falls back to polling GET /api/runs/:id if the stream errors (the
 * in-memory progress registry only covers runs started in the current
 * server process, e.g. after a dev-server restart).
 */
export default function RunProgress({
  id,
  initialMeta,
}: {
  id: string;
  initialMeta: RunMeta;
}) {
  const [progress, setProgress] = useState<RunProgressData>(
    initialMeta.progress,
  );
  const [polling, setPolling] = useState(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    finishedRef.current = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;

    function finish() {
      if (finishedRef.current) return;
      finishedRef.current = true;
      if (pollTimer) clearInterval(pollTimer);
      if (stallTimer) clearTimeout(stallTimer);
      // Simplest reliable way to move from the running branch to the done
      // branch: reload and let the page re-fetch /api/runs/:id fresh.
      window.location.reload();
    }

    function startPolling() {
      if (stallTimer) clearTimeout(stallTimer);
      setPolling(true);
      pollTimer = setInterval(async () => {
        try {
          const res = await fetch(`/api/runs/${id}`, { cache: "no-store" });
          if (!res.ok) return;
          const data = (await res.json()) as { meta?: RunMeta };
          if (data.meta && data.meta.status !== "running") finish();
        } catch {
          // transient network hiccup — keep polling
        }
      }, POLL_INTERVAL_MS);
    }

    function resetStallTimer() {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        source.close();
        startPolling();
      }, STALL_TIMEOUT_MS);
    }

    const source = new EventSource(`/api/runs/${id}/stream`);
    resetStallTimer();
    source.onmessage = (event) => {
      resetStallTimer();
      try {
        const data = JSON.parse(event.data) as RunProgressData;
        setProgress(data);
        if (data.phase === "done") {
          source.close();
          finish();
        }
      } catch {
        // ignore malformed frame
      }
    };
    source.onerror = () => {
      if (stallTimer) clearTimeout(stallTimer);
      source.close();
      startPolling();
    };

    return () => {
      source.close();
      if (pollTimer) clearInterval(pollTimer);
      if (stallTimer) clearTimeout(stallTimer);
    };
  }, [id]);

  const total = progress.total ?? 0;
  const pageIndex = progress.pageIndex ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((pageIndex / total) * 100)) : 0;
  const indeterminate = progress.phase === "compare" || total === 0;
  const currentStage = stageIndex(progress);

  return (
    <div className="card animate-fade-up flex flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl text-ink">{phaseLabel(progress)}</h2>
        {progress.label && (
          <p className="font-mono text-sm text-muted">
            {progress.label}
            {total > 0 && (
              <span className="stat text-faint">
                {" "}
                — {pageIndex}/{total}
              </span>
            )}
          </p>
        )}
      </div>

      <ol className="flex flex-wrap items-center gap-2">
        {STAGES.map((stage, i) => (
          <li key={stage.key} className="flex items-center gap-2">
            <span
              className={`pill ${
                i < currentStage
                  ? "bg-match-bg text-match"
                  : i === currentStage
                    ? "bg-accent text-canvas"
                    : "bg-surface-2 text-faint"
              }`}
            >
              {stage.label}
            </span>
            {i < STAGES.length - 1 && (
              <span aria-hidden className="text-faint">
                →
              </span>
            )}
          </li>
        ))}
      </ol>

      <div
        className="progress-track"
        role="progressbar"
        aria-label={phaseLabel(progress)}
        aria-valuenow={indeterminate ? undefined : pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {indeterminate ? (
          <div className="progress-fill-indeterminate" />
        ) : (
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 border-t border-border pt-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">
            {initialMeta.siteA.label}
          </span>
          <span className="font-mono text-sm break-all text-ink">
            {initialMeta.siteA.baseURL}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">
            {initialMeta.siteB.label}
          </span>
          <span className="font-mono text-sm break-all text-ink">
            {initialMeta.siteB.baseURL}
          </span>
        </div>
      </div>

      {polling && (
        <p className="text-xs text-faint">
          Live updates unavailable — polling for status…
        </p>
      )}
    </div>
  );
}
