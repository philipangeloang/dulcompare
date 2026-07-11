"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ComparisonResult, RunMeta } from "@/lib/types";
import RunProgress from "@/components/RunProgress";
import ComparisonViewer from "@/components/ComparisonViewer";
import { suiteLabel } from "@/lib/labels";

type RunData = { meta: RunMeta; comparison: ComparisonResult | null };

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [data, setData] = useState<RunData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/runs/${id}`, { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setData(null);
          setLoadError(null);
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error(`Failed to load run (${res.status})`);
        const json = (await res.json()) as RunData;
        if (cancelled) return;
        setNotFound(false);
        setLoadError(null);
        setData(json);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setData(null);
        setNotFound(false);
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (notFound) {
    return (
      <div className="card animate-fade-up flex flex-col items-center gap-3 p-12 text-center">
        <h1 className="font-display text-xl text-ink">Run not found</h1>
        <p className="text-sm text-muted">
          This run doesn&apos;t exist, or its record has been removed.
        </p>
        <Link href="/runs" className="btn btn-secondary mt-2">
          Back to history
        </Link>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="card animate-fade-up flex flex-col gap-3 bg-warn-bg p-8">
        <h1 className="font-display text-xl text-warn">Couldn&apos;t load this run</h1>
        <p className="font-mono text-sm text-warn">{loadError}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card animate-fade-up p-12 text-center text-sm text-muted">
        Loading run…
      </div>
    );
  }

  const { meta, comparison } = data;

  if (meta.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        <div className="card animate-fade-up flex flex-col gap-3 bg-warn-bg p-8">
          <h1 className="font-display text-xl text-warn">Comparison failed</h1>
          <p className="font-mono text-sm text-warn">
            {meta.error ?? "Unknown error."}
          </p>
        </div>
        <Link
          href="/"
          className="btn btn-primary animate-fade-up animate-fade-up-2 self-start"
        >
          Start a new comparison
        </Link>
      </div>
    );
  }

  if (meta.status === "running") {
    return (
      <div className="flex flex-col gap-6">
        <RunHeader meta={meta} />
        <RunProgress id={id} initialMeta={meta} />
      </div>
    );
  }

  // meta.status === "done"
  if (!comparison) {
    return (
      <div className="flex flex-col gap-6">
        <RunHeader meta={meta} />
        <div className="card animate-fade-up animate-fade-up-2 p-8 text-center text-sm text-muted">
          This run finished but no comparison data was saved.
        </div>
      </div>
    );
  }

  return <ComparisonViewer meta={meta} comparison={comparison} />;
}

function RunHeader({ meta }: { meta: RunMeta }) {
  const created = new Date(meta.createdAt);
  return (
    <div className="animate-fade-up flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl text-ink sm:text-3xl">
          <span className="text-a-only">{meta.siteA.label}</span>
          <span className="mx-2 text-faint italic">vs</span>
          <span className="text-b-only">{meta.siteB.label}</span>
        </h1>
        <span className="pill bg-surface-2 text-muted">{suiteLabel(meta.suite)}</span>
      </div>
      <p className="text-sm text-muted">
        {meta.presetSnapshot.name} · {created.toLocaleString()}
      </p>
    </div>
  );
}
