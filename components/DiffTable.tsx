"use client";

import { useState } from "react";
import type { DiffRow } from "@/lib/types";
import StatusPill, { statusKind } from "@/components/StatusPill";

interface DiffTableProps {
  rows: DiffRow[];
  siteALabel: string;
  siteBLabel: string;
  /**
   * "seo" groups rows by page only (PageSection). "datalayer" groups by page
   * then by event (DataLayerPageSection/EventGroupRows), with an occurrence
   * column and a human-readable reason column.
   */
  mode?: "seo" | "datalayer";
}

interface PageGroup {
  page: string;
  url: string;
  rows: DiffRow[];
}

interface EventGroup {
  event: string;
  rows: DiffRow[];
}

function isMatch(status: string): boolean {
  return status.startsWith("match");
}

function groupByPage(rows: DiffRow[]): PageGroup[] {
  const groups: PageGroup[] = [];
  // Key on page+url so distinct URLs that share a non-unique preset label
  // (e.g. "Product Detail" ×12, "Article Detail" ×24) each get their own
  // section instead of merging into one card that shows only the first URL.
  const index = new Map<string, PageGroup>();
  for (const row of rows) {
    const key = `${row.page} ${row.url}`;
    let group = index.get(key);
    if (!group) {
      group = { page: row.page, url: row.url, rows: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

/** Rows within a page are already emitted event-by-event (sorted) by compareDatalayer, so a single pass keeps each event's rows contiguous. */
function groupByEvent(rows: DiffRow[]): EventGroup[] {
  const groups: EventGroup[] = [];
  const index = new Map<string, DiffRow[]>();
  for (const row of rows) {
    const eventName = row.event ?? "(unknown)";
    let group = index.get(eventName);
    if (!group) {
      group = [];
      index.set(eventName, group);
      groups.push({ event: eventName, rows: group });
    }
    group.push(row);
  }
  return groups;
}

export default function DiffTable({
  rows,
  siteALabel,
  siteBLabel,
  mode = "seo",
}: DiffTableProps) {
  const groups = groupByPage(rows);

  if (groups.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-muted">
        No rows match the current filters.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) =>
        mode === "datalayer" ? (
          <DataLayerPageSection
            key={`${group.page} ${group.url}`}
            group={group}
            siteALabel={siteALabel}
            siteBLabel={siteBLabel}
          />
        ) : (
          <PageSection
            key={`${group.page} ${group.url}`}
            group={group}
            siteALabel={siteALabel}
            siteBLabel={siteBLabel}
            mode={mode}
          />
        ),
      )}
    </div>
  );
}

function PageSection({
  group,
  siteALabel,
  siteBLabel,
  mode,
}: {
  group: PageGroup;
  siteALabel: string;
  siteBLabel: string;
  mode: "seo" | "datalayer";
}) {
  const [expanded, setExpanded] = useState(false);
  const matches = group.rows.filter((r) => isMatch(r.status));
  const diffs = group.rows.filter((r) => !isMatch(r.status));
  const allMatch = diffs.length === 0;

  if (allMatch) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/70 px-4 py-3 text-sm">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-match" />
        <span className="text-ink">
          <span className="font-medium">{group.page}</span>
          <span className="text-muted">
            {" "}
            — all {matches.length} field{matches.length === 1 ? "" : "s"} match
          </span>
        </span>
        <span className="ml-auto truncate font-mono text-xs text-faint">
          {group.url}
        </span>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border bg-surface-2 px-4 py-3">
        <h3 className="font-display text-base text-ink">{group.page}</h3>
        <span className="truncate font-mono text-xs text-muted">{group.url}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[32%]" />
            <col className="w-[32%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs font-medium tracking-wide text-muted uppercase">
              <th className="px-4 py-2 font-medium">Field</th>
              <th className="px-4 py-2 font-medium">{siteALabel}</th>
              <th className="px-4 py-2 font-medium">{siteBLabel}</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((row, i) => (
              <DiffRowLine
                key={`${row.section ?? row.event ?? ""}-${row.occurrence ?? ""}-${row.key}-${i}`}
                row={row}
                siteALabel={siteALabel}
                siteBLabel={siteBLabel}
                mode={mode}
              />
            ))}
            {matches.length > 0 && (
              <tr>
                <td colSpan={4} className="p-0">
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <span
                      className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}
                      aria-hidden
                    >
                      ▸
                    </span>
                    {matches.length} matching field{matches.length === 1 ? "" : "s"}
                  </button>
                </td>
              </tr>
            )}
            {expanded &&
              matches.map((row, i) => (
                <DiffRowLine
                  key={`${row.section ?? row.event ?? ""}-${row.occurrence ?? ""}-${row.key}-${i}`}
                  row={row}
                  siteALabel={siteALabel}
                  siteBLabel={siteBLabel}
                  mode={mode}
                  faded
                />
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DiffRowLine({
  row,
  siteALabel,
  siteBLabel,
  mode,
  faded,
}: {
  row: DiffRow;
  siteALabel: string;
  siteBLabel: string;
  mode: "seo" | "datalayer";
  faded?: boolean;
}) {
  const kind = statusKind(row.status, siteALabel, siteBLabel);
  const tintA = kind === "diff" ? "bg-diff-bg" : kind === "a-only" ? "bg-a-only-bg" : "";
  const tintB = kind === "diff" ? "bg-diff-bg" : kind === "b-only" ? "bg-b-only-bg" : "";
  const showSchemaTag = mode === "seo" && Boolean(row.schemaType);

  return (
    <tr className={`border-b border-border last:border-b-0 hover:bg-surface-2/60 ${faded ? "opacity-70" : ""}`}>
      <td className="px-4 py-2.5 align-top">
        <div className="font-mono text-xs break-words text-ink">{row.key}</div>
        {showSchemaTag && (
          <span className="pill mt-1 inline-flex bg-surface-2 text-faint normal-case">
            {row.schemaType}
          </span>
        )}
      </td>
      <ValueCell value={row.valueA} tintClass={tintA} />
      <ValueCell value={row.valueB} tintClass={tintB} />
      <td className="px-4 py-2.5 align-top">
        <StatusPill status={row.status} siteALabel={siteALabel} siteBLabel={siteBLabel} />
      </td>
    </tr>
  );
}

function ValueCell({ value, tintClass }: { value: string; tintClass: string }) {
  return (
    <td className={`px-4 py-2.5 align-top font-mono text-xs break-words whitespace-pre-wrap text-ink ${tintClass}`}>
      {value === "" ? <span className="text-faint">—</span> : value}
    </td>
  );
}

function DataLayerPageSection({
  group,
  siteALabel,
  siteBLabel,
}: {
  group: PageGroup;
  siteALabel: string;
  siteBLabel: string;
}) {
  const eventGroups = groupByEvent(group.rows);
  const matchCount = group.rows.filter((r) => isMatch(r.status)).length;
  const allMatch = matchCount === group.rows.length;

  if (allMatch) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/70 px-4 py-3 text-sm">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-match" />
        <span className="text-ink">
          <span className="font-medium">{group.page}</span>
          <span className="text-muted">
            {" "}
            — all {eventGroups.length} event{eventGroups.length === 1 ? "" : "s"} match
          </span>
        </span>
        <span className="ml-auto truncate font-mono text-xs text-faint">
          {group.url}
        </span>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border bg-surface-2 px-4 py-3">
        <h3 className="font-display text-base text-ink">{group.page}</h3>
        <span className="truncate font-mono text-xs text-muted">{group.url}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <colgroup>
            <col className="w-[7%]" />
            <col className="w-[15%]" />
            <col className="w-[18%]" />
            <col className="w-[18%]" />
            <col className="w-[12%]" />
            <col className="w-[30%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs font-medium tracking-wide text-muted uppercase">
              <th className="px-4 py-2 font-medium">Occ.</th>
              <th className="px-4 py-2 font-medium">Key</th>
              <th className="px-4 py-2 font-medium">{siteALabel}</th>
              <th className="px-4 py-2 font-medium">{siteBLabel}</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {eventGroups.map((eg) => (
              <EventGroupRows
                key={eg.event}
                eventName={eg.event}
                rows={eg.rows}
                siteALabel={siteALabel}
                siteBLabel={siteBLabel}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EventGroupRows({
  eventName,
  rows,
  siteALabel,
  siteBLabel,
}: {
  eventName: string;
  rows: DiffRow[];
  siteALabel: string;
  siteBLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const matches = rows.filter((r) => isMatch(r.status));
  const diffs = rows.filter((r) => !isMatch(r.status));
  const occurrenceCount = new Set(rows.map((r) => r.occurrence).filter(Boolean)).size;
  const showOccurrence = occurrenceCount > 1;

  return (
    <>
      <tr className="border-b border-border bg-surface-2/50">
        <td colSpan={6} className="px-4 py-1.5">
          <span className="font-mono text-xs font-medium text-ink">{eventName}</span>
          <span className="stat ml-2 text-xs text-faint">
            {occurrenceCount || 1} occurrence{occurrenceCount === 1 || occurrenceCount === 0 ? "" : "s"}
          </span>
        </td>
      </tr>
      {diffs.map((row, i) => (
        <DataLayerRowLine
          key={`${row.event}-${row.occurrence}-${row.key}-${i}`}
          row={row}
          siteALabel={siteALabel}
          siteBLabel={siteBLabel}
          showOccurrence={showOccurrence}
        />
      ))}
      {matches.length > 0 && (
        <tr>
          <td colSpan={6} className="p-0">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <span
                className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}
                aria-hidden
              >
                ▸
              </span>
              {matches.length} matching field{matches.length === 1 ? "" : "s"}
            </button>
          </td>
        </tr>
      )}
      {expanded &&
        matches.map((row, i) => (
          <DataLayerRowLine
            key={`${row.event}-${row.occurrence}-${row.key}-${i}`}
            row={row}
            siteALabel={siteALabel}
            siteBLabel={siteBLabel}
            showOccurrence={showOccurrence}
            faded
          />
        ))}
    </>
  );
}

function DataLayerRowLine({
  row,
  siteALabel,
  siteBLabel,
  showOccurrence,
  faded,
}: {
  row: DiffRow;
  siteALabel: string;
  siteBLabel: string;
  showOccurrence: boolean;
  faded?: boolean;
}) {
  const kind = statusKind(row.status, siteALabel, siteBLabel);
  const tintA = kind === "diff" ? "bg-diff-bg" : kind === "a-only" ? "bg-a-only-bg" : "";
  const tintB = kind === "diff" ? "bg-diff-bg" : kind === "b-only" ? "bg-b-only-bg" : "";

  return (
    <tr className={`border-b border-border last:border-b-0 hover:bg-surface-2/60 ${faded ? "opacity-70" : ""}`}>
      <td className="px-4 py-2.5 align-top">
        {showOccurrence ? (
          <span className="stat text-xs text-muted">{row.occurrence}</span>
        ) : (
          <span className="text-xs text-faint">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 align-top">
        <div className="font-mono text-xs break-words text-ink">{row.key}</div>
      </td>
      <ValueCell value={row.valueA} tintClass={tintA} />
      <ValueCell value={row.valueB} tintClass={tintB} />
      <td className="px-4 py-2.5 align-top">
        <StatusPill status={row.status} siteALabel={siteALabel} siteBLabel={siteBLabel} />
      </td>
      <td className="px-4 py-2.5 align-top text-xs break-words whitespace-pre-wrap text-muted">
        {row.reason ? row.reason : <span className="text-faint">—</span>}
      </td>
    </tr>
  );
}
