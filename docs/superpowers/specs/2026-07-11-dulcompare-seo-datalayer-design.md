# dulcompare — SEO + dataLayer comparison web app

**Date:** 2026-07-11
**Status:** Design approved, pending spec review

## Problem

The `spa-poc` repo carries a `tests/` folder with two Playwright-based comparison suites — **SEO** (hreflang / JSON-LD schema / page metadata) and **dataLayer** (GTM event capture) — that diff two site variants (legacy FreeMarker "FTL" vs new Next.js "React") against each other. Both suites work well but their only output is CSV/XLSX files opened in a spreadsheet and filtered by a `status` column. Configuration (base URLs, page lists) is hardcoded in per-site TypeScript config files and selected via a `SITE` env var.

We want a standalone tool, in the existing (empty) **`dulcompare`** repo, that:

1. Keeps the existing capture + diff logic — it is the real value and is already correct.
2. Replaces CSV output with a good-looking **web UI** for viewing comparisons.
3. Lets the user **trigger captures from buttons** instead of the CLI.
4. Lets the user enter the **two site base URLs via UI fields**, not hardcoded config.
5. Keeps a **history** of past comparison runs.

## Scope

**In scope (v1):**
- SEO suite: hreflang, JSON-LD schema, page metadata capture + diff.
- dataLayer suite: GTM `dataLayer.push` capture with per-page scripted interactions + diff (including the existing `classifyReason` domain knowledge).
- Web UI: new-comparison form, live run progress, comparison viewer, run history, preset editor.
- Editable **presets** for page sets (paths, and for dataLayer, per-page interactions).
- JSON-on-disk persistence for presets and run history.
- CSV export retained as a download button (spreadsheet workflow not lost).

**Out of scope (v1):**
- The `isr-cache-warm` suite (an ops script, not a comparison).
- Deployment / hosting. Tool runs **locally only** (`pnpm dev`, open localhost). Structure keeps the capture backend separable so a hosted worker could be added later, but no hosting work now.
- Auth, multi-user concurrency (single local user assumed).
- Auto-discovery of pages from `sitemap.xml` (may come later; presets cover the need for now).
- Generalizing the dataLayer `classifyReason` domain knowledge beyond dulcolax FTL-vs-React (ported as-is).

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Capture + view, or view only? | **Full app** — buttons trigger captures; base URLs are UI fields. |
| Suite scope | **SEO + dataLayer.** |
| Page-list configurability | **Editable presets** — default dulcolax presets, editable in UI, saved as JSON. Base URLs always free-text fields. |
| Where it runs | **Local only.** Keep capture backend separable for a possible future hosted worker. |
| Run history | **Keep history** — every run saved, browsable, nothing overwritten. |
| Capture mechanism | **Playwright core** (`chromium.launch()`) called from a Next.js route handler — drop the `@playwright/test` test-runner harness. |

## Architecture

Single **Next.js (App Router) + TypeScript + Tailwind** app.

```
dulcompare/
├── app/
│   ├── page.tsx                 # New comparison form
│   ├── runs/page.tsx            # Run history list
│   ├── runs/[id]/page.tsx       # Comparison viewer (main screen)
│   ├── presets/page.tsx         # Preset editor
│   └── api/
│       ├── runs/route.ts        # POST: start a run;  GET: list runs
│       ├── runs/[id]/route.ts   # GET: run meta + comparison JSON
│       ├── runs/[id]/stream/route.ts   # GET: SSE live progress
│       └── presets/route.ts     # CRUD presets
├── lib/
│   ├── capture/
│   │   ├── browser.ts           # chromium.launch() lifecycle
│   │   ├── seo.ts               # extractHreflang / extractSchema / extractMetadata (ported)
│   │   ├── datalayer.ts         # installDatalayerCapture / acceptCookies / collectEvents (ported)
│   │   └── interact.ts          # runInteractions (ported ~verbatim)
│   ├── compare/
│   │   ├── seo-compare.ts       # ported from seo/compare.mjs → returns objects, not CSV
│   │   ├── datalayer-compare.ts # ported from datalayer/compare.mjs (incl. classifyReason, KNOWN_OVERFIRE_EVENTS, SKIP_EVENTS)
│   │   ├── flatten.ts           # shared dot-notation flattener
│   │   └── metadata-fields.ts   # METADATA_FIELDS / METADATA_URL_FIELDS (ported)
│   ├── runner.ts                # orchestrates: launch → capture A → capture B → compare → save + emit progress
│   └── store.ts                 # JSON-on-disk read/write for presets & runs
├── data/                        # gitignored
│   ├── presets/*.json
│   └── runs/<runId>/{meta,site-a,site-b,comparison}.json
├── components/                  # UI (diff table, status pills, progress, forms)
└── docs/
```

### Design principle: keep the brain, replace the face

The existing `compare.mjs` files are pure functions that end by serializing rows to CSV. In dulcompare they **return structured objects** instead:

```ts
type DiffRow = {
  page: string; url: string;
  // SEO also: section: 'hreflang' | 'schema' | 'metadata', schemaType?, field?
  // dataLayer also: event, occurrence, reason
  key: string; valueA: string; valueB: string;
  status: 'match' | 'value_diff' | `${string}_only` | 'match (none)' | 'match (whitespace)' | string;
};
```

The React UI consumes these objects directly. A CSV serializer (the current logic) is retained purely for the "Download CSV" button. This makes the port behavior-preserving: **the existing CSVs in `spa-poc/tests/*/reports/` are the correctness oracle** — the UI's numbers must match them.

## Data model

**Preset** — `data/presets/<id>.json`, a named editable page set scoped to one suite:
```jsonc
{
  "id": "dulcolax-datalayer",
  "name": "Dulcolax dataLayer",
  "suite": "datalayer",           // 'seo' | 'datalayer'
  "pages": [
    { "label": "Home", "path": "",
      "interactions": [ { "type": "click", "selector": "nav a.mega-nav__itemLink" } ],
      "skipEvents": ["generic"] }
  ]
}
```
Seed presets shipped on first run, imported from the current configs:
- `dulcolax-seo` — ~48 SEO paths (from `seo/urls/dulcolax.react.ts`).
- `dulcolax-datalayer` — 8 pages with interactions (from `datalayer/urls.dulcolax.react.ts`).

**Run** — `data/runs/<runId>/`:
```
meta.json        { id, createdAt, suite, siteA:{label,baseURL}, siteB:{label,baseURL},
                   presetId, presetSnapshot, status:'running'|'done'|'error', progress, error? }
site-a.json      per-page captured reports (same JSON shape the current specs write)
site-b.json
comparison.json  { summary:{match,value_diff,a_only,b_only,...}, rows: DiffRow[] }
```
`presetSnapshot` stores the page set as-used so editing a preset later doesn't rewrite history. History is a directory listing of `data/runs/`; nothing is ever overwritten.

## Capture flow

`runner.ts`:
1. Launch one Chromium instance.
2. For Site A then Site B, for each page in the preset:
   - **SEO:** `page.goto(path, { waitUntil: 'domcontentloaded' })` → `extractHreflang` + `extractSchema` + `extractMetadata`.
   - **dataLayer:** `installDatalayerCapture` before load → `goto(networkidle)` → `acceptCookies` → gradual scroll (6 steps) → `runInteractions` → `collectEvents`, honoring `skipEvents`. Track `failedInteractions`.
   - Per-page failures (timeout, crash) are caught: the page is recorded as errored and the run continues.
3. Write `site-a.json` / `site-b.json`.
4. Run the matching compare module → write `comparison.json`.
5. Emit progress events throughout (`{ phase:'capture', site:'A', pageIndex, total, label }`), forwarded to the UI over SSE. A run registry in server memory tracks in-flight runs; progress is also persisted to `meta.json` so a reload can recover state.

Timing constants (`SETTLE_MS`, scroll steps, interaction waits) are carried over from the current specs unchanged.

## UI — four screens

1. **New comparison** (`/`) — Site A label + base URL, Site B label + base URL, suite toggle (SEO / dataLayer), preset dropdown (filtered to the chosen suite), **Run** button. Validates base URLs before starting.
2. **Live run** — page-by-page progress streamed over SSE; per-page ok/errored ticks; rolls into the comparison viewer when the run completes.
3. **Comparison viewer** (`/runs/[id]`) — the "looks good, no CSV" payoff:
   - Summary header: match / value_diff / A-only / B-only counts (+ dataLayer's `match (over-fire)` / `match (whitespace)`).
   - Status filter; matches collapsed by default so diffs stand out.
   - Results grouped by page. **SEO** shows sub-tabs (Hreflang / Schema / Metadata). **dataLayer** groups event → occurrence → key and surfaces the `reason` text.
   - Each row: Site A value beside Site B value, color-coded status pill.
   - Per-view **Download CSV** button (reuses ported serializer).
4. **Preset editor** (`/presets`) — pick a preset, edit the page list (and, for dataLayer, per-page interactions) in a form, save as new or overwrite. Seed presets editable like any other.

The exact visual layout of the comparison viewer's diff rows/grouping will be mocked (browser companion) during implementation before building.

## Error handling

- **Per-page capture failure** (timeout, selector crash) — caught, page marked errored in the report, run continues.
- **Unreachable / invalid base URL** — run fails fast, clear message surfaced on the form and stored in `meta.error`.
- **dataLayer failed interactions** — a selector that doesn't resolve is recorded in `failedInteractions` (existing behavior) and flagged in the viewer, not fatal.
- **Browser launch failure** — surfaced as a run-level error with guidance to run `pnpm exec playwright install chromium`.

## Testing / verification

Per the user's standing preference, **no unit-test framework** (no vitest/jest). Verification is:
- `pnpm typecheck` + `pnpm lint` clean.
- Manual smoke run: capture dulcolax FTL vs React for both suites, confirm the viewer renders.
- **Oracle check:** the ported diff logic is behavior-preserving, so the new UI's per-status counts and rows are diffed against the existing CSVs in `spa-poc/tests/seo/reports/` and `spa-poc/tests/datalayer/reports/`. Numbers must match.

## Migration notes

- `@playwright/test` is dropped; dulcompare depends on `playwright` (core) directly. Browsers installed via `pnpm exec playwright install chromium`.
- Extraction helpers, `interact.ts`, `metadata-fields`, and both compare engines port with minimal edits (the compare engines change only their output stage: rows/objects instead of CSV strings).
- The `dulcompare` repo is currently empty and not git-initialized; scaffolding creates the Next.js app there. Git init and all commits are handled by the user.

## Open questions for implementation

- Comparison-viewer visual layout — to be mocked before building.
- SSE vs. polling fallback if SSE proves awkward with the Next dev server (SSE is the plan; polling `meta.json` is the fallback).
