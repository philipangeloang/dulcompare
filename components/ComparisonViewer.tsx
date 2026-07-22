"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type {
  ComparisonResult,
  ComparisonSummary,
  DiffRow,
  IndexedDiffRow,
  RunMeta,
} from "@/lib/types";
import DiffTable from "@/components/DiffTable";
import { KIND_CLASSES, type StatusKind } from "@/components/StatusPill";
import { rowsToCsv } from "@/lib/compare/csv";
import { suiteLabel } from "@/lib/labels";

type BucketKey = keyof ComparisonSummary;
type Section = NonNullable<DiffRow["section"]>;

// Passed sits second, right after Match, so the "accepted / resolved" counts read together.
const TILE_ORDER: (BucketKey | "passed")[] = ["match", "passed", "value_diff", "a_only", "b_only", "other"];
const SUMMARY_KIND: Record<BucketKey, StatusKind> = {
  match: "match",
  value_diff: "diff",
  a_only: "a-only",
  b_only: "b-only",
  other: "neutral",
};

const SECTIONS: { key: Section; label: string }[] = [
  { key: "hreflang", label: "Hreflang" },
  { key: "schema", label: "Schema" },
  { key: "metadata", label: "Metadata" },
];

const CSV_COLUMNS: string[] = [
  "page",
  "url",
  "section",
  "schemaType",
  "key",
  "valueA",
  "valueB",
  "status",
  "reviewed",
];

const CSV_COLUMNS_DATALAYER: string[] = [
  "page",
  "url",
  "event",
  "occurrence",
  "key",
  "valueA",
  "valueB",
  "status",
  "reason",
  "reviewed",
];

/** Mirrors the bucketing logic in lib/compare/seo-compare.ts and lib/compare/datalayer-compare.ts's pushRow. */
function bucketOf(status: string, siteALabel: string, siteBLabel: string): BucketKey {
  if (status.startsWith("match")) return "match";
  if (status === "value_diff") return "value_diff";
  if (status === `${siteALabel}_only`) return "a_only";
  if (status === `${siteBLabel}_only`) return "b_only";
  return "other";
}

function downloadCsv(rows: Record<string, unknown>[], columns: string[], filename: string) {
  const csv = rowsToCsv(rows, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ComparisonViewer({
  meta,
  comparison,
}: {
  meta: RunMeta;
  comparison: ComparisonResult;
}) {
  const { siteA, siteB } = meta;
  const isDatalayer = meta.suite === "datalayer";
  const [activeSection, setActiveSection] = useState<Section>("metadata");
  const [statusFilter, setStatusFilter] = useState<BucketKey | "passed" | null>(null);
  const [pageFilter, setPageFilter] = useState("");
  const [passed, setPassed] = useState<Set<number>>(() => new Set(meta.passed ?? []));

  const created = new Date(meta.createdAt);

  const summaryLabels: Record<BucketKey | "passed", string> = {
    match: "Match",
    value_diff: "Value diff",
    a_only: `${siteA.label} only`,
    b_only: `${siteB.label} only`,
    other: "Other",
    passed: "Passed",
  };

  const indexed: IndexedDiffRow[] = useMemo(
    () => comparison.rows.map((r, idx) => ({ ...r, idx })),
    [comparison.rows],
  );

  const persist = useCallback(
    (next: Set<number>) => {
      fetch(`/api/runs/${meta.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passed: [...next] }),
      }).catch((err) => console.error("Failed to persist passed rows", err));
    },
    [meta.id],
  );

  const togglePass = useCallback(
    (idx: number) => {
      const next = new Set(passed);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      setPassed(next);
      persist(next);
    },
    [passed, persist],
  );

  const matchingIndices = useCallback(
    (row: DiffRow, scope: "template" | "run") =>
      indexed
        .filter(
          (r) =>
            r.key === row.key &&
            r.status === row.status &&
            r.section === row.section &&
            r.event === row.event &&
            (scope === "run" || r.page === row.page),
        )
        .map((r) => r.idx),
    [indexed],
  );

  const bulkPass = useCallback(
    (row: DiffRow, scope: "template" | "run") => {
      const next = new Set(passed);
      for (const idx of matchingIndices(row, scope)) next.add(idx);
      setPassed(next);
      persist(next);
    },
    [passed, matchingIndices, persist],
  );

  const matchCount = useCallback(
    (row: DiffRow, scope: "template" | "run") => matchingIndices(row, scope).length,
    [matchingIndices],
  );

  const bySection = useMemo(() => {
    const map = new Map<Section, IndexedDiffRow[]>(SECTIONS.map((s) => [s.key, []]));
    for (const row of indexed) {
      if (!row.section) continue;
      map.get(row.section)?.push(row);
    }
    return map;
  }, [indexed]);

  const hasOverfireOrWhitespace = useMemo(
    () => isDatalayer && comparison.rows.some((r) => r.status.startsWith("match (")),
    [isDatalayer, comparison.rows],
  );

  // Rows the summary + table operate over: for SEO, only the active section
  // (so the tiles tell you whether THAT tab is clean); datalayer has no sections.
  const scopeRows = useMemo(
    () => (isDatalayer ? indexed : (bySection.get(activeSection) ?? [])),
    [isDatalayer, indexed, bySection, activeSection],
  );

  const counts = useMemo(() => {
    const c = { match: 0, value_diff: 0, a_only: 0, b_only: 0, other: 0, passed: 0 };
    for (const r of scopeRows) {
      if (passed.has(r.idx)) {
        c.passed++;
        continue;
      }
      c[bucketOf(r.status, siteA.label, siteB.label)]++;
    }
    return c;
  }, [scopeRows, passed, siteA.label, siteB.label]);

  const filteredRows = useMemo(() => {
    // Scoped to the active section (SEO) or all rows (datalayer); status chips
    // filter within that scope so the visible rows always match the tile counts.
    let rows: IndexedDiffRow[] = scopeRows;
    if (statusFilter === "passed") {
      rows = rows.filter((r) => passed.has(r.idx));
    } else if (statusFilter) {
      rows = rows.filter(
        (r) => !passed.has(r.idx) && bucketOf(r.status, siteA.label, siteB.label) === statusFilter,
      );
    }
    const q = pageFilter.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) => r.page.toLowerCase().includes(q) || r.url.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [scopeRows, statusFilter, passed, pageFilter, siteA.label, siteB.label]);

  const activeSectionLabel = SECTIONS.find((s) => s.key === activeSection)?.label ?? "";

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-up flex flex-col gap-3">
        <Link
          href="/runs"
          className="w-fit text-xs font-medium text-muted transition-colors hover:text-ink"
        >
          ← Back to history
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl text-ink sm:text-3xl">
            <span className="text-a-only">{siteA.label}</span>
            <span className="mx-2 text-faint italic">vs</span>
            <span className="text-b-only">{siteB.label}</span>
          </h1>
          <span className="pill bg-surface-2 text-muted">{suiteLabel(meta.suite)}</span>
        </div>
        <p className="text-sm text-muted">
          {meta.presetSnapshot.name} · {created.toLocaleString()}
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-muted">
          <span>
            <span className="text-a-only">{siteA.label}</span> {siteA.baseURL}
          </span>
          <span>
            <span className="text-b-only">{siteB.label}</span> {siteB.baseURL}
          </span>
        </div>
      </div>

      {meta.warnings && Object.keys(meta.warnings).length > 0 && (
        <div className="card animate-fade-up flex flex-col gap-3 bg-warn-bg p-6 sm:p-8">
          <h2 className="font-display text-lg text-warn">Capture warnings</h2>
          <ul className="flex flex-col gap-2 text-sm text-warn">
            {Object.entries(meta.warnings).map(([label, messages]) => (
              <li key={label}>
                <span className="font-medium">{label}</span>
                <ul className="mt-0.5 flex flex-col gap-0.5 pl-4 font-mono text-xs">
                  {messages.map((message, i) => (
                    <li key={i}>{message}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card animate-fade-up animate-fade-up-1 flex flex-col gap-4 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg text-ink">Summary</h2>
            {!isDatalayer && (
              <span className="pill bg-surface-2 text-muted">{activeSectionLabel}</span>
            )}
          </div>
          <span className="stat text-sm text-muted">
            {scopeRows.length} {isDatalayer ? "rows total" : "rows in this tab"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {TILE_ORDER.map((key) => {
            const active = statusFilter === key;
            const kindClasses = key === "passed" ? "bg-accent/10 text-accent" : KIND_CLASSES[SUMMARY_KIND[key]];
            const borderClasses = active
              ? "border-ink ring-2 ring-accent/40"
              : key === "passed"
                ? "border-accent/30 hover:border-accent/50"
                : "border-border hover:border-ink/25";
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter((cur) => (cur === key ? null : key))}
                aria-pressed={active}
                className={`flex flex-col gap-1 rounded-lg border p-4 text-left transition-all ${kindClasses} ${borderClasses}`}
              >
                <span className="stat text-2xl font-medium">{counts[key]}</span>
                <span className="text-xs font-medium tracking-wide uppercase opacity-80">
                  {summaryLabels[key]}
                </span>
                {key === "match" && hasOverfireOrWhitespace && (
                  <span className="text-[10px] font-normal tracking-normal text-faint normal-case">
                    incl. over-fire / whitespace
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card animate-fade-up animate-fade-up-2 flex flex-col gap-4 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-4">
          {!isDatalayer && (
            <div className="inline-flex rounded-lg border border-border bg-surface-2 p-1">
              {SECTIONS.map((s) => {
                const rows = bySection.get(s.key) ?? [];
                // Unresolved diffs = non-match and not yet accepted, so a fully
                // reviewed section reads "0 diffs".
                const diffs = rows.filter(
                  (r) => !r.status.startsWith("match") && !passed.has(r.idx),
                ).length;
                const active = activeSection === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setActiveSection(s.key)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                      active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
                    }`}
                  >
                    {s.label}
                    <span className="stat text-xs text-faint">
                      {rows.length}
                      {diffs > 0 ? ` · ${diffs} diff${diffs === 1 ? "" : "s"}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={pageFilter}
              onChange={(e) => setPageFilter(e.target.value)}
              placeholder="Filter by page or URL…"
              className="input w-48"
            />
            {statusFilter && (
              <button
                type="button"
                onClick={() => setStatusFilter(null)}
                className="btn btn-secondary text-xs"
              >
                Clear filter
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const csvRows = filteredRows.map((r) => ({
                  ...r,
                  reviewed: passed.has(r.idx) ? "passed" : "",
                }));
                return isDatalayer
                  ? downloadCsv(csvRows, CSV_COLUMNS_DATALAYER, "dulcompare-datalayer.csv")
                  : downloadCsv(
                      csvRows,
                      CSV_COLUMNS,
                      `dulcompare-${meta.suite}-${activeSection}.csv`,
                    );
              }}
              className="btn btn-secondary"
            >
              Download CSV
            </button>
          </div>
        </div>

        <DiffTable
          rows={filteredRows}
          siteALabel={siteA.label}
          siteBLabel={siteB.label}
          mode={isDatalayer ? "datalayer" : "seo"}
          review={{ passed, onToggle: togglePass, onBulk: bulkPass, matchCount }}
        />
      </div>
    </div>
  );
}
