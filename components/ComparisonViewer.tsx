"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ComparisonResult, ComparisonSummary, DiffRow, RunMeta } from "@/lib/types";
import DiffTable from "@/components/DiffTable";
import { KIND_CLASSES, type StatusKind } from "@/components/StatusPill";
import { rowsToCsv } from "@/lib/compare/csv";
import { suiteLabel } from "@/lib/labels";

type BucketKey = keyof ComparisonSummary;
type Section = NonNullable<DiffRow["section"]>;

const SUMMARY_ORDER: BucketKey[] = ["match", "value_diff", "a_only", "b_only", "other"];
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

const CSV_COLUMNS: (keyof DiffRow)[] = [
  "page",
  "url",
  "section",
  "schemaType",
  "key",
  "valueA",
  "valueB",
  "status",
];

const CSV_COLUMNS_DATALAYER: (keyof DiffRow)[] = [
  "page",
  "url",
  "event",
  "occurrence",
  "key",
  "valueA",
  "valueB",
  "status",
  "reason",
];

/** Mirrors the bucketing logic in lib/compare/seo-compare.ts and lib/compare/datalayer-compare.ts's pushRow. */
function bucketOf(status: string, siteALabel: string, siteBLabel: string): BucketKey {
  if (status.startsWith("match")) return "match";
  if (status === "value_diff") return "value_diff";
  if (status === `${siteALabel}_only`) return "a_only";
  if (status === `${siteBLabel}_only`) return "b_only";
  return "other";
}

function downloadCsv(rows: DiffRow[], columns: (keyof DiffRow)[], filename: string) {
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
  const [statusFilter, setStatusFilter] = useState<BucketKey | null>(null);
  const [pageFilter, setPageFilter] = useState("");

  const created = new Date(meta.createdAt);

  const summaryLabels: Record<BucketKey, string> = {
    match: "Match",
    value_diff: "Value diff",
    a_only: `${siteA.label} only`,
    b_only: `${siteB.label} only`,
    other: "Other",
  };

  const bySection = useMemo(() => {
    const map = new Map<Section, DiffRow[]>(SECTIONS.map((s) => [s.key, []]));
    for (const row of comparison.rows) {
      if (!row.section) continue;
      map.get(row.section)?.push(row);
    }
    return map;
  }, [comparison.rows]);

  const hasOverfireOrWhitespace = useMemo(
    () => isDatalayer && comparison.rows.some((r) => r.status.startsWith("match (")),
    [isDatalayer, comparison.rows],
  );

  const filteredRows = useMemo(() => {
    // Summary tiles count across ALL sections, so when a status chip is active we must
    // filter across all sections too (not just the active tab) — otherwise the visible
    // rows silently under-count vs. the tile. Datalayer has no sections and always uses
    // all rows.
    let rows =
      isDatalayer || statusFilter
        ? comparison.rows
        : (bySection.get(activeSection) ?? []);
    if (statusFilter) {
      rows = rows.filter(
        (r) => bucketOf(r.status, siteA.label, siteB.label) === statusFilter,
      );
    }
    const q = pageFilter.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) => r.page.toLowerCase().includes(q) || r.url.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [isDatalayer, comparison.rows, bySection, activeSection, statusFilter, pageFilter, siteA.label, siteB.label]);

  // While a status chip is active the table shows all sections combined, so the
  // section sub-tabs no longer scope the view — disable them to avoid implying they do.
  const sectionTabsDisabled = Boolean(statusFilter);

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
          <h2 className="font-display text-lg text-ink">Summary</h2>
          <span className="stat text-sm text-muted">
            {comparison.rows.length} rows total
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {SUMMARY_ORDER.map((key) => {
            const active = statusFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter((cur) => (cur === key ? null : key))}
                aria-pressed={active}
                className={`flex flex-col gap-1 rounded-lg border p-4 text-left transition-all ${KIND_CLASSES[SUMMARY_KIND[key]]} ${
                  active ? "border-ink ring-2 ring-accent/40" : "border-border hover:border-ink/25"
                }`}
              >
                <span className="stat text-2xl font-medium">{comparison.summary[key]}</span>
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
            <div
              className={`inline-flex rounded-lg border border-border bg-surface-2 p-1 transition-opacity ${
                sectionTabsDisabled ? "opacity-50" : ""
              }`}
              title={
                sectionTabsDisabled
                  ? "Showing all sections while a status filter is active"
                  : undefined
              }
            >
              {SECTIONS.map((s) => {
                const rows = bySection.get(s.key) ?? [];
                const diffs = rows.filter((r) => !r.status.startsWith("match")).length;
                const active = !sectionTabsDisabled && activeSection === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setActiveSection(s.key)}
                    aria-pressed={active}
                    disabled={sectionTabsDisabled}
                    className={`flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
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
              onClick={() =>
                isDatalayer
                  ? downloadCsv(filteredRows, CSV_COLUMNS_DATALAYER, "dulcompare-datalayer.csv")
                  : downloadCsv(
                      filteredRows,
                      CSV_COLUMNS,
                      `dulcompare-${meta.suite}-${statusFilter ? "all-sections" : activeSection}.csv`,
                    )
              }
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
        />
      </div>
    </div>
  );
}
