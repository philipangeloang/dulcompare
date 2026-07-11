"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RunMeta, RunStatus } from "@/lib/types";
import { suiteLabel } from "@/lib/labels";

const STATUS_BADGE: Record<RunStatus, string> = {
  running: "bg-surface-2 text-accent",
  done: "bg-match-bg text-match",
  error: "bg-warn-bg text-warn",
};

const ROW_COLUMNS = "grid-cols-[190px_100px_1fr_110px]";

export default function RunsPage() {
  const [runs, setRuns] = useState<RunMeta[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/runs", { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(`Failed to load runs (${res.status})`);
        const json = (await res.json()) as RunMeta[];
        if (cancelled) return;
        setRuns(json);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div className="animate-fade-up flex flex-col gap-2">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">History</h1>
        <p className="max-w-2xl text-muted">Past comparison runs.</p>
      </div>

      {loadError ? (
        <div className="card animate-fade-up animate-fade-up-2 flex flex-col gap-3 bg-warn-bg p-8">
          <h2 className="font-display text-xl text-warn">Couldn&apos;t load history</h2>
          <p className="font-mono text-sm text-warn">{loadError}</p>
        </div>
      ) : runs === null ? (
        <div className="card animate-fade-up animate-fade-up-2 p-12 text-center text-sm text-muted">
          Loading runs…
        </div>
      ) : runs.length === 0 ? (
        <div className="card animate-fade-up animate-fade-up-2 flex flex-col items-center gap-3 p-12 text-center">
          <p className="text-sm text-muted">No comparisons yet.</p>
          <Link href="/" className="btn btn-primary mt-1">
            Start one
          </Link>
        </div>
      ) : (
        <div className="card animate-fade-up animate-fade-up-2 overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div
                className={`grid ${ROW_COLUMNS} gap-4 border-b border-border bg-surface-2 px-5 py-3 text-xs font-medium tracking-wide text-muted uppercase`}
              >
                <span>Created</span>
                <span>Suite</span>
                <span>Comparison</span>
                <span>Status</span>
              </div>
              {runs.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RunRow({ run }: { run: RunMeta }) {
  const created = new Date(run.createdAt);
  return (
    <Link
      href={`/runs/${run.id}`}
      className={`grid ${ROW_COLUMNS} items-center gap-4 border-b border-border px-5 py-3 text-sm transition-colors last:border-b-0 hover:bg-surface-2`}
    >
      <span className="stat text-xs text-muted">{created.toLocaleString()}</span>
      <span className="pill w-fit bg-surface-2 text-muted">{suiteLabel(run.suite)}</span>
      <span className="truncate">
        <span className="text-a-only">{run.siteA.label}</span>
        <span className="mx-1.5 text-faint italic">vs</span>
        <span className="text-b-only">{run.siteB.label}</span>
      </span>
      <span className={`pill w-fit ${STATUS_BADGE[run.status]}`}>{run.status}</span>
    </Link>
  );
}
