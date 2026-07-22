"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { DiffRow, IndexedDiffRow } from "@/lib/types";
import StatusPill, { statusKind } from "@/components/StatusPill";

interface ReviewProps {
  passed: Set<number>;
  onToggle: (idx: number) => void;
  onBulk: (row: DiffRow, scope: "template" | "run") => void;
  matchCount: (row: DiffRow, scope: "template" | "run") => number;
}

const PassContext = createContext<ReviewProps | null>(null);

interface DiffTableProps {
  rows: IndexedDiffRow[];
  siteALabel: string;
  siteBLabel: string;
  /**
   * "seo" groups rows by page only (PageSection). "datalayer" groups by page
   * then by event (DataLayerPageSection/EventGroupRows), with an occurrence
   * column and a human-readable reason column.
   */
  mode?: "seo" | "datalayer";
  review: ReviewProps;
}

interface PageGroup {
  page: string;
  url: string;
  rows: IndexedDiffRow[];
}

interface EventGroup {
  event: string;
  rows: IndexedDiffRow[];
}

function isMatch(status: string): boolean {
  return status.startsWith("match");
}

function groupByPage(rows: IndexedDiffRow[]): PageGroup[] {
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
function groupByEvent(rows: IndexedDiffRow[]): EventGroup[] {
  const groups: EventGroup[] = [];
  const index = new Map<string, IndexedDiffRow[]>();
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
  review,
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
    <PassContext.Provider value={review}>
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
    </PassContext.Provider>
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
  row: IndexedDiffRow;
  siteALabel: string;
  siteBLabel: string;
  mode: "seo" | "datalayer";
  faded?: boolean;
}) {
  const review = useContext(PassContext);
  const isPassed = review?.passed.has(row.idx) ?? false;
  const kind = statusKind(row.status, siteALabel, siteBLabel);
  const tintA = !isPassed && kind === "diff" ? "bg-diff-bg" : !isPassed && kind === "a-only" ? "bg-a-only-bg" : "";
  const tintB = !isPassed && kind === "diff" ? "bg-diff-bg" : !isPassed && kind === "b-only" ? "bg-b-only-bg" : "";
  const showSchemaTag = mode === "seo" && Boolean(row.schemaType);

  return (
    <tr
      className={`border-b border-border last:border-b-0 hover:bg-surface-2/60 ${faded ? "opacity-70" : ""} ${isPassed ? "bg-accent/5" : ""}`}
    >
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
        {!isMatch(row.status) && <PassControl row={row} />}
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
  rows: IndexedDiffRow[];
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
  row: IndexedDiffRow;
  siteALabel: string;
  siteBLabel: string;
  showOccurrence: boolean;
  faded?: boolean;
}) {
  const review = useContext(PassContext);
  const isPassed = review?.passed.has(row.idx) ?? false;
  const kind = statusKind(row.status, siteALabel, siteBLabel);
  const tintA = !isPassed && kind === "diff" ? "bg-diff-bg" : !isPassed && kind === "a-only" ? "bg-a-only-bg" : "";
  const tintB = !isPassed && kind === "diff" ? "bg-diff-bg" : !isPassed && kind === "b-only" ? "bg-b-only-bg" : "";

  return (
    <tr
      className={`border-b border-border last:border-b-0 hover:bg-surface-2/60 ${faded ? "opacity-70" : ""} ${isPassed ? "bg-accent/5" : ""}`}
    >
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
        {!isMatch(row.status) && <PassControl row={row} />}
      </td>
      <td className="px-4 py-2.5 align-top text-xs break-words whitespace-pre-wrap text-muted">
        {row.reason ? row.reason : <span className="text-faint">—</span>}
      </td>
    </tr>
  );
}

function PassControl({ row }: { row: IndexedDiffRow }) {
  const review = useContext(PassContext);
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  if (!review) return null;
  const isPassed = review.passed.has(row.idx);

  if (isPassed) {
    return (
      <div className="mt-1.5 flex items-center gap-2">
        <span className="pill bg-accent/10 text-accent normal-case">✓ Passed</span>
        <button
          type="button"
          onClick={() => review.onToggle(row.idx)}
          className="text-[11px] font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Undo
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex items-center gap-1">
      <button
        type="button"
        onClick={() => review.onToggle(row.idx)}
        className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-medium text-ink transition-colors hover:bg-surface-2"
      >
        Pass
      </button>
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-label="Bulk pass options"
        className="flex items-center rounded-md border border-border bg-surface px-1.5 py-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <ChevronDown />
      </button>
      {menuOpen && (
        <BulkMenu anchorRef={toggleRef} onClose={() => setMenuOpen(false)}>
          <button
            type="button"
            onClick={() => {
              review.onBulk(row, "template");
              setMenuOpen(false);
            }}
            className="block w-full rounded-md px-3 py-2 text-left text-xs text-ink transition-colors hover:bg-surface-2"
          >
            Pass &quot;{row.key}&quot; on all &quot;{row.page}&quot; pages ({review.matchCount(row, "template")})
          </button>
          <button
            type="button"
            onClick={() => {
              review.onBulk(row, "run");
              setMenuOpen(false);
            }}
            className="block w-full rounded-md px-3 py-2 text-left text-xs text-ink transition-colors hover:bg-surface-2"
          >
            Pass &quot;{row.key}&quot; across all pages ({review.matchCount(row, "run")})
          </button>
        </BulkMenu>
      )}
    </div>
  );
}

function ChevronDown() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

/**
 * Renders the bulk-accept menu in a fixed-position portal anchored to the ▾
 * toggle. A portal is required because the toggle lives in the Status cell of a
 * table wrapped in both `overflow-x-auto` and the card — a normally-positioned
 * popover would be clipped at the card's right edge. Positioned right-aligned to
 * the anchor (opens leftward) and flips above when near the viewport bottom.
 */
function BulkMenu({
  anchorRef,
  onClose,
  children,
}: {
  anchorRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    const a = anchor.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const margin = 8;
    // Right-align the menu to the anchor's right edge (open leftward), clamped
    // into the viewport.
    let left = a.right - m.width;
    left = Math.max(margin, Math.min(left, window.innerWidth - m.width - margin));
    // Prefer below the anchor; flip above if it would overflow the bottom.
    let top = a.bottom + 4;
    if (top + m.height > window.innerHeight - margin) top = a.top - m.height - 4;
    top = Math.max(margin, top);
    setPos({ top, left });
  }, [anchorRef]);

  useEffect(() => {
    const handlePointer = (e: MouseEvent) => {
      if (
        menuRef.current?.contains(e.target as Node) ||
        anchorRef.current?.contains(e.target as Node)
      )
        return;
      onClose();
    };
    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
      className="z-50 w-64 rounded-lg border border-border bg-surface p-1 shadow-lg"
    >
      {children}
    </div>,
    document.body,
  );
}
