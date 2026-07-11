# dulcompare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Next.js web app in the `dulcompare` repo that captures SEO (hreflang/schema/metadata) and GTM dataLayer data from two site variants via Playwright, diffs them, and shows the comparison in a good-looking UI instead of CSVs — with UI-entered base URLs, button-triggered runs, editable presets, and saved run history.

**Architecture:** Single Next.js App Router app. Route handlers call Playwright core (`chromium.launch()`) directly (no `@playwright/test` harness). The existing capture helpers and both `compare.mjs` diff engines are ported into `lib/`, changed only so the compare engines return structured objects instead of CSV strings. Presets and runs persist as JSON on disk under `data/`. Live progress streams over SSE.

**Tech Stack:** Next.js (App Router) 15+, React 19, TypeScript (strict), Tailwind CSS, Playwright core, Node fs for persistence.

## Global Constraints

- **No unit-test framework.** Do not add vitest/jest/mocha or any `*.test.ts`. Per-task verification is `pnpm typecheck` + `pnpm lint` + targeted manual runs + oracle checks against existing CSVs. Throwaway one-off `node` verification scripts are allowed but must be deleted (not committed) after use.
- **The user handles all git.** Do NOT run `git add`, `git commit`, or stage anything. Each task ends with a **CHECKPOINT** where you report the deliverable and stop for the user to review and commit.
- **Correctness oracle:** the existing CSVs at `d:/Downloads/Software/Crescendo/spa-poc/opl-frontend/tests/seo/reports/` and `.../tests/datalayer/reports/` are ground truth. Ported diff logic must reproduce the same statuses/counts.
- **Source of truth for ports** (read these; they are on the same disk):
  - SEO extract: `spa-poc/opl-frontend/tests/seo/helpers/seo.ts`
  - SEO compare: `spa-poc/opl-frontend/tests/seo/compare.mjs`
  - SEO metadata fields: `spa-poc/opl-frontend/tests/seo/metadata-fields.mjs`
  - SEO seed pages: `spa-poc/opl-frontend/tests/seo/urls/dulcolax.react.ts` and `dulcolax.ftl.ts`
  - dataLayer capture: `spa-poc/opl-frontend/tests/datalayer/helpers/datalayer.ts`
  - dataLayer interact: `spa-poc/opl-frontend/tests/datalayer/helpers/interact.ts`
  - dataLayer compare: `spa-poc/opl-frontend/tests/datalayer/compare.mjs`
  - dataLayer seed pages: `spa-poc/opl-frontend/tests/datalayer/urls.dulcolax.react.ts` and `urls.dulcolax.ftl.ts`
- **Package manager:** pnpm.
- All paths below are relative to the `dulcompare` repo root (`d:/Downloads/Software/Crescendo/dulcompare/`).

---

## File structure

```
dulcompare/
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── page.tsx                       # New comparison form
│   ├── runs/page.tsx                  # Run history
│   ├── runs/[id]/page.tsx             # Comparison viewer
│   ├── presets/page.tsx               # Preset editor
│   └── api/
│       ├── runs/route.ts              # POST start run, GET list
│       ├── runs/[id]/route.ts         # GET run + comparison
│       ├── runs/[id]/stream/route.ts  # SSE progress
│       └── presets/route.ts           # GET all / POST upsert
├── lib/
│   ├── types.ts                       # shared types (Preset, Page, Run, DiffRow, ...)
│   ├── store.ts                       # JSON-on-disk persistence + seed
│   ├── run-registry.ts                # in-memory in-flight run + progress emitter
│   ├── runner.ts                      # orchestration
│   ├── capture/
│   │   ├── browser.ts
│   │   ├── seo.ts
│   │   ├── datalayer.ts
│   │   └── interact.ts
│   └── compare/
│       ├── flatten.ts
│       ├── metadata-fields.ts
│       ├── seo-compare.ts
│       ├── datalayer-compare.ts
│       └── csv.ts                     # DiffRow[] -> CSV string
├── components/
│   ├── ComparisonForm.tsx
│   ├── RunProgress.tsx
│   ├── ComparisonViewer.tsx
│   ├── DiffTable.tsx
│   ├── StatusPill.tsx
│   └── PresetEditor.tsx
├── data/                              # gitignored: presets/, runs/
└── docs/
```

---

### Task 1: Scaffold the Next.js app

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `.gitignore`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx` (placeholder)

**Interfaces:**
- Produces: a runnable Next.js app with Tailwind and a `data/` dir ignored by git.

- [ ] **Step 1: Create the app with pnpm**

Run in the repo root:
```bash
pnpm create next-app@latest . --ts --tailwind --app --eslint --no-src-dir --import-alias "@/*" --use-pnpm
```
If the directory-not-empty prompt appears (docs/ exists), choose to continue/overwrite non-conflicting files. Keep the generated `app/`, `tailwind`, `tsconfig`, `eslint` setup.

- [ ] **Step 2: Add Playwright core and install a browser**

```bash
pnpm add playwright
pnpm exec playwright install chromium
```

- [ ] **Step 3: Ignore the data dir**

Append to `.gitignore`:
```
# dulcompare runtime data
/data/
```

- [ ] **Step 4: Replace `app/page.tsx` with a placeholder**

```tsx
export default function Home() {
  return <main className="p-8"><h1 className="text-2xl font-semibold">dulcompare</h1></main>;
}
```

- [ ] **Step 5: Verify**

```bash
pnpm typecheck || pnpm exec tsc --noEmit
pnpm lint
pnpm dev
```
Expected: dev server serves `http://localhost:3000` showing "dulcompare"; typecheck and lint clean. (If `typecheck` script is missing, add `"typecheck": "tsc --noEmit"` to `package.json` scripts.)

- [ ] **Step 6: CHECKPOINT** — report that the app scaffolds, runs, and lints clean. Stop for user review/commit.

---

### Task 2: Shared types + compare primitives

**Files:**
- Create: `lib/types.ts`, `lib/compare/flatten.ts`, `lib/compare/metadata-fields.ts`

**Interfaces:**
- Produces:
  - `lib/types.ts`: `Suite = 'seo' | 'datalayer'`; `Interaction` (union copied from dataLayer source); `PageEntry = { label: string; path: string; interactions?: Interaction[]; skipEvents?: string[] }`; `Preset = { id: string; name: string; suite: Suite; pages: PageEntry[] }`; `SiteRef = { label: string; baseURL: string }`; `DiffRow` (see below); `RunMeta`, `RunProgress`, `ComparisonResult`.
  - `flatten(obj: unknown, prefix?: string): Record<string, unknown>` — dot-notation flattener.
  - `METADATA_FIELDS: string[]`, `METADATA_URL_FIELDS: Set<string>`.

- [ ] **Step 1: Write `lib/compare/flatten.ts`** — copy the `flatten` function body verbatim from `spa-poc/.../seo/compare.mjs` lines 41-60, typed:

```ts
export function flatten(obj: unknown, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries((obj ?? {}) as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') {
          Object.assign(out, flatten(item, `${key}.${i}`));
        } else {
          out[`${key}.${i}`] = item;
        }
      });
    } else {
      out[key] = v;
    }
  }
  return out;
}
```

- [ ] **Step 2: Write `lib/compare/metadata-fields.ts`** — copy both exports verbatim from `spa-poc/.../seo/metadata-fields.mjs` (the `METADATA_FIELDS` array and the `METADATA_URL_FIELDS` Set), as a `.ts` file with `export const METADATA_FIELDS = [...] as const` widened to `string[]` where consumed, and `export const METADATA_URL_FIELDS = new Set<string>([...])`.

- [ ] **Step 3: Write `lib/types.ts`**

```ts
export type Suite = 'seo' | 'datalayer';

export type Interaction =
  | { type: 'click'; selector: string }
  | { type: 'select'; selector: string; value?: string }
  | { type: 'fill'; selector: string; value: string }
  | { type: 'focus'; selector: string }
  | { type: 'video'; selector?: string }
  | { type: 'seek'; selector?: string; percent: number }
  | { type: 'scroll-to-top' }
  | { type: 'wait'; ms: number };

export interface PageEntry {
  label: string;
  path: string;
  interactions?: Interaction[];
  skipEvents?: string[];
}

export interface Preset { id: string; name: string; suite: Suite; pages: PageEntry[]; }
export interface SiteRef { label: string; baseURL: string; }

export interface DiffRow {
  page: string;
  url: string;
  section?: 'hreflang' | 'schema' | 'metadata'; // SEO only
  schemaType?: string;                           // SEO schema only
  event?: string;                                // dataLayer only
  occurrence?: string;                           // dataLayer only
  key: string;
  valueA: string;
  valueB: string;
  status: string; // 'match' | 'value_diff' | `${siteKey}_only` | 'match (none)' | 'match (whitespace)' | 'match (... over-fire)'
  reason?: string; // dataLayer only
}

export interface ComparisonSummary { match: number; value_diff: number; a_only: number; b_only: number; other: number; }
export interface ComparisonResult { summary: ComparisonSummary; rows: DiffRow[]; }

export type RunStatus = 'running' | 'done' | 'error';
export interface RunProgress { phase: 'capture' | 'compare' | 'done'; site?: 'A' | 'B'; pageIndex?: number; total?: number; label?: string; }
export interface RunMeta {
  id: string;
  createdAt: string;
  suite: Suite;
  siteA: SiteRef;
  siteB: SiteRef;
  presetId: string;
  presetSnapshot: Preset;
  status: RunStatus;
  progress: RunProgress;
  error?: string;
  warnings?: Record<string, string[]>; // pageLabel -> messages (e.g. dataLayer failed interactions)
}
```

- [ ] **Step 4: Verify** — `pnpm exec tsc --noEmit`. Expected: clean.

- [ ] **Step 5: CHECKPOINT** — report types + primitives compile. Stop for review/commit.

---

### Task 3: Port SEO capture helpers

**Files:**
- Create: `lib/capture/seo.ts`

**Interfaces:**
- Consumes: `playwright`'s `Page`.
- Produces: `extractHreflang(page): Promise<{hreflang:string;href:string}[]>`, `extractSchema(page): Promise<any[]>`, `extractMetadata(page): Promise<Record<string, unknown>>`.

- [ ] **Step 1: Write `lib/capture/seo.ts`** — port the three functions from `spa-poc/.../seo/helpers/seo.ts` verbatim, changing only the import to `import type { Page } from 'playwright';` (core, not `@playwright/test`). The `page.evaluate` bodies are unchanged.

- [ ] **Step 2: Verify** — `pnpm exec tsc --noEmit`. Expected: clean.

- [ ] **Step 3: CHECKPOINT** — report. Stop for review/commit.

---

### Task 4: Port SEO compare engine (returns objects)

**Files:**
- Create: `lib/compare/seo-compare.ts`, `lib/compare/csv.ts`

**Interfaces:**
- Consumes: `flatten`, `METADATA_FIELDS`, `METADATA_URL_FIELDS`, `DiffRow`, `ComparisonResult`.
- Produces:
  - `compareSeo(reportsA: Record<string, any>, reportsB: Record<string, any>, siteKeyA: string, siteKeyB: string): ComparisonResult`
  - `rowsToCsv(rows: DiffRow[], columns: (keyof DiffRow)[]): string`

- [ ] **Step 1: Write `lib/compare/csv.ts`**

```ts
import type { DiffRow } from '@/lib/types';

function csvCell(v: unknown): string {
  if (v === undefined || v === null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows: DiffRow[], columns: (keyof DiffRow)[]): string {
  const header = columns.map(String);
  const body = rows.map((r) => columns.map((c) => csvCell(r[c])).join(','));
  return [header.join(','), ...body].join('\n');
}
```

- [ ] **Step 2: Write `lib/compare/seo-compare.ts`** — port the three comparison blocks (hreflang, schema, metadata) from `spa-poc/.../seo/compare.mjs` lines 62-296. Preserve all logic (`normalizePath`, block `@type` matching, `normalizeMetaValue`, `formatMetaCsvValue`, status derivation) exactly. Instead of pushing CSV cell arrays, push `DiffRow` objects. Map each block's rows to the `section` field (`'hreflang' | 'schema' | 'metadata'`). Accumulate `summary` counts by bucketing `status`: `match`/`match (none)` → not counted as diff (count under `match`); `value_diff` → `value_diff`; `${siteKeyA}_only` → `a_only`; `${siteKeyB}_only` → `b_only`; anything else → `other`. Return `{ summary, rows }`.

  Hreflang rows: since the source emits one row per page with joined hrefs, emit one `DiffRow` per page with `section:'hreflang'`, `key:'hreflang'`, `valueA`=hrefs joined by `\n`, `valueB`=same for B, and `status` `'match'`/`'match (none)'`/`'has_diff'`. Additionally, to make diffs granular in the UI, emit one extra `DiffRow` per missing/extra href with `status` `${siteKeyA}_only`/`${siteKeyB}_only` and `key` = the href path. (This mirrors the CSV's missing/extra columns while giving the UI per-item rows.)

- [ ] **Step 3: Oracle-verify SEO compare** — write a throwaway script `scripts/oracle-seo.mjs` (delete after) that reads the two existing report dirs and asserts parity:

```js
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
// dynamic import the compiled TS via tsx OR replicate: simplest is run with `pnpm exec tsx scripts/oracle-seo.mjs`
import { compareSeo } from '../lib/compare/seo-compare.ts';
const base = 'd:/Downloads/Software/Crescendo/spa-poc/opl-frontend/tests/seo/reports';
const read = (d) => Object.fromEntries(readdirSync(join(base, d)).filter(f => f.endsWith('.json')).map(f => [f, JSON.parse(readFileSync(join(base, d, f), 'utf8'))]));
const res = compareSeo(read('dulcolax-ftl'), read('dulcolax-react'), 'dulcolax.ftl', 'dulcolax.react');
const metaDiffs = res.rows.filter(r => r.section === 'metadata' && r.status !== 'match' && r.status !== 'match (none)').length;
console.log('metadata diffs:', metaDiffs, 'summary:', res.summary);
```
Add `tsx` as a dev dep if needed (`pnpm add -D tsx`). Run: `pnpm exec tsx scripts/oracle-seo.mjs`. Open the existing `compare-metadata-dulcolax.ftl-vs-dulcolax.react-mon-uat.csv`, count rows whose `status != match` and `!= match (none)`, and confirm the script's `metadata diffs` matches. Repeat sanity for schema. Delete `scripts/oracle-seo.mjs` when done.

- [ ] **Step 4: Verify** — `pnpm exec tsc --noEmit` clean; oracle numbers match the CSV.

- [ ] **Step 5: CHECKPOINT** — report oracle parity numbers. Stop for review/commit.

---

### Task 5: Persistence store + seed presets

**Files:**
- Create: `lib/store.ts`, `lib/seed-presets.ts`

**Interfaces:**
- Produces:
  - `listPresets(): Promise<Preset[]>`, `getPreset(id): Promise<Preset|null>`, `upsertPreset(p: Preset): Promise<void>`
  - `listRuns(): Promise<RunMeta[]>`, `getRunMeta(id): Promise<RunMeta|null>`, `saveRunMeta(m: RunMeta): Promise<void>`
  - `saveSiteReport(runId, side:'a'|'b', reports: Record<string, any>): Promise<void>`, `readSiteReport(runId, side): Promise<Record<string, any>>`
  - `saveComparison(runId, c: ComparisonResult): Promise<void>`, `getComparison(runId): Promise<ComparisonResult|null>`
  - `ensureSeeded(): Promise<void>` — writes the two seed presets if `data/presets` is empty.

- [ ] **Step 1: Write `lib/seed-presets.ts`** — export `SEED_PRESETS: Preset[]` with two entries:
  - `{ id: 'dulcolax-seo', name: 'Dulcolax SEO', suite: 'seo', pages: [...] }` — copy the `pages` array from `spa-poc/.../seo/urls/dulcolax.react.ts` (labels + paths only).
  - `{ id: 'dulcolax-datalayer', name: 'Dulcolax dataLayer', suite: 'datalayer', pages: [...] }` — copy the `pages` array (labels, paths, interactions, skipEvents) from `spa-poc/.../datalayer/urls.dulcolax.react.ts`.

- [ ] **Step 2: Write `lib/store.ts`** — implement the interface above over `data/presets/*.json` and `data/runs/<id>/{meta,site-a,site-b,comparison}.json`, using `fs/promises`, creating dirs with `mkdir({recursive:true})`. `ensureSeeded()` writes each `SEED_PRESETS` entry only if no preset files exist. `listRuns()` reads every `meta.json` and sorts by `createdAt` desc. Use a module-level `const DATA = path.join(process.cwd(), 'data')`.

```ts
import { promises as fs } from 'fs';
import path from 'path';
import type { Preset, RunMeta, ComparisonResult } from '@/lib/types';
import { SEED_PRESETS } from '@/lib/seed-presets';

const DATA = path.join(process.cwd(), 'data');
const PRESETS = path.join(DATA, 'presets');
const RUNS = path.join(DATA, 'runs');

async function readJson<T>(p: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(p, 'utf8')) as T; } catch { return null; }
}
async function writeJson(p: string, v: unknown): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(v, null, 2));
}

export async function ensureSeeded(): Promise<void> {
  await fs.mkdir(PRESETS, { recursive: true });
  const existing = await fs.readdir(PRESETS).catch(() => []);
  if (existing.some((f) => f.endsWith('.json'))) return;
  for (const p of SEED_PRESETS) await writeJson(path.join(PRESETS, `${p.id}.json`), p);
}

export async function listPresets(): Promise<Preset[]> {
  await ensureSeeded();
  const files = await fs.readdir(PRESETS).catch(() => []);
  const out: Preset[] = [];
  for (const f of files.filter((f) => f.endsWith('.json'))) {
    const p = await readJson<Preset>(path.join(PRESETS, f));
    if (p) out.push(p);
  }
  return out;
}
export const getPreset = (id: string) => readJson<Preset>(path.join(PRESETS, `${id}.json`));
export const upsertPreset = (p: Preset) => writeJson(path.join(PRESETS, `${p.id}.json`), p);

const runDir = (id: string) => path.join(RUNS, id);
export const saveRunMeta = (m: RunMeta) => writeJson(path.join(runDir(m.id), 'meta.json'), m);
export const getRunMeta = (id: string) => readJson<RunMeta>(path.join(runDir(id), 'meta.json'));
export const saveSiteReport = (id: string, side: 'a' | 'b', r: Record<string, unknown>) =>
  writeJson(path.join(runDir(id), `site-${side}.json`), r);
export const readSiteReport = (id: string, side: 'a' | 'b') =>
  readJson<Record<string, any>>(path.join(runDir(id), `site-${side}.json`));
export const saveComparison = (id: string, c: ComparisonResult) => writeJson(path.join(runDir(id), 'comparison.json'), c);
export const getComparison = (id: string) => readJson<ComparisonResult>(path.join(runDir(id), 'comparison.json'));

export async function listRuns(): Promise<RunMeta[]> {
  const ids = await fs.readdir(RUNS).catch(() => []);
  const metas: RunMeta[] = [];
  for (const id of ids) {
    const m = await getRunMeta(id);
    if (m) metas.push(m);
  }
  return metas.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
```

- [ ] **Step 3: Verify** — `pnpm exec tsc --noEmit` clean. Manual: run a throwaway `pnpm exec tsx -e "import('./lib/store.ts').then(m=>m.listPresets()).then(console.log)"` and confirm two seed presets print. Delete any scratch.

- [ ] **Step 4: CHECKPOINT** — report seeded presets load. Stop for review/commit.

---

### Task 6: Browser lifecycle + runner (SEO path) + run registry

**Files:**
- Create: `lib/capture/browser.ts`, `lib/run-registry.ts`, `lib/runner.ts`

**Interfaces:**
- Consumes: `chromium` from `playwright`, `lib/capture/seo.ts`, `lib/compare/seo-compare.ts`, `lib/store.ts`, types.
- Produces:
  - `withBrowser<T>(fn: (browser) => Promise<T>): Promise<T>`
  - `run-registry`: `emit(runId, progress: RunProgress): void`, `subscribe(runId, cb): () => void`, `setDone(runId)`, `getLast(runId)`.
  - `startRun(input: { suite: Suite; siteA: SiteRef; siteB: SiteRef; presetId: string }): Promise<string>` — creates run, kicks off async capture, returns `runId`. Uses `randomUUID()` for the id and `new Date().toISOString()` for timestamps.

- [ ] **Step 1: Write `lib/capture/browser.ts`**

```ts
import { chromium, type Browser } from 'playwright';

export async function withBrowser<T>(fn: (b: Browser) => Promise<T>): Promise<T> {
  const browser = await chromium.launch();
  try { return await fn(browser); }
  finally { await browser.close(); }
}
```

- [ ] **Step 2: Write `lib/run-registry.ts`** — a module-level `Map<string, { last: RunProgress; subs: Set<(p:RunProgress)=>void> }>`. `emit` updates `last` and notifies subs; `subscribe` adds a callback and returns an unsubscribe fn; `getLast` returns the last progress. This lets the SSE route stream progress for an in-flight run.

- [ ] **Step 3: Write `lib/runner.ts`** — implement `captureSeoSite` (loops preset pages, `page.goto(baseURL+path, {waitUntil:'domcontentloaded'})`, runs the three SEO extracts, writes a per-page report object keyed by the same slug rule the current spec uses: `(path||'home').replace(/\//g,'-').replace(/[^a-z0-9-]/g,'') + '.json'`; wrap each page in try/catch so a failure records `{error: message}` and continues; emit progress per page). Then `startRun`:

```ts
import { randomUUID } from 'crypto';
import { withBrowser } from '@/lib/capture/browser';
import * as seo from '@/lib/capture/seo';
import { compareSeo } from '@/lib/compare/seo-compare';
import * as store from '@/lib/store';
import * as registry from '@/lib/run-registry';
import type { RunMeta, SiteRef, Suite, Preset, RunProgress } from '@/lib/types';

const slug = (p: string) => (p || 'home').replace(/\//g, '-').replace(/[^a-z0-9-]/g, '');

export async function startRun(input: { suite: Suite; siteA: SiteRef; siteB: SiteRef; presetId: string }): Promise<string> {
  const preset = await store.getPreset(input.presetId);
  if (!preset) throw new Error(`Preset not found: ${input.presetId}`);
  const id = randomUUID();
  const meta: RunMeta = {
    id, createdAt: new Date().toISOString(), suite: input.suite,
    siteA: input.siteA, siteB: input.siteB, presetId: preset.id, presetSnapshot: preset,
    status: 'running', progress: { phase: 'capture', site: 'A', pageIndex: 0, total: preset.pages.length },
  };
  await store.saveRunMeta(meta);
  // fire-and-forget; do not await
  void execute(meta, preset).catch(async (e) => {
    meta.status = 'error'; meta.error = String(e?.message ?? e);
    await store.saveRunMeta(meta); registry.setDone(id);
  });
  return id;
}

async function execute(meta: RunMeta, preset: Preset): Promise<void> {
  const emit = async (p: RunProgress) => { meta.progress = p; registry.emit(meta.id, p); await store.saveRunMeta(meta); };
  await withBrowser(async (browser) => {
    const reportsA = await captureSeoSite(browser, meta, preset, 'A', meta.siteA.baseURL, emit);
    await store.saveSiteReport(meta.id, 'a', reportsA);
    const reportsB = await captureSeoSite(browser, meta, preset, 'B', meta.siteB.baseURL, emit);
    await store.saveSiteReport(meta.id, 'b', reportsB);
    await emit({ phase: 'compare' });
    const comparison = compareSeo(reportsA, reportsB, meta.siteA.label, meta.siteB.label);
    await store.saveComparison(meta.id, comparison);
  });
  meta.status = 'done';
  await emit({ phase: 'done' });
  registry.setDone(meta.id);
}

async function captureSeoSite(browser, meta, preset, side: 'A'|'B', baseURL: string, emit): Promise<Record<string, any>> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const reports: Record<string, any> = {};
  for (let i = 0; i < preset.pages.length; i++) {
    const entry = preset.pages[i];
    await emit({ phase: 'capture', site: side, pageIndex: i + 1, total: preset.pages.length, label: entry.label });
    const url = baseURL.replace(/\/$/, '/') + entry.path; // baseURL ends with '/'
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      reports[`${slug(entry.path)}.json`] = {
        url, label: entry.label, capturedAt: new Date().toISOString(),
        hreflang: await seo.extractHreflang(page),
        schema: await seo.extractSchema(page),
        metadata: await seo.extractMetadata(page),
      };
    } catch (e) {
      reports[`${slug(entry.path)}.json`] = { url, label: entry.label, error: String((e as Error)?.message ?? e), hreflang: [], schema: [], metadata: {} };
    }
  }
  await ctx.close();
  return reports;
}
```
Note: normalize `baseURL` join so exactly one `/` separates base and path (base URLs in presets/inputs end with `/`; paths do not start with `/`).

- [ ] **Step 4: Manual verify** — temporarily add a tiny 2-page preset (or use `dulcolax-seo` trimmed) and call `startRun` via a scratch `pnpm exec tsx -e "..."` against the two live dulcolax base URLs from the source config comments; confirm `data/runs/<id>/site-a.json`, `site-b.json`, `comparison.json`, `meta.json` appear and comparison summary looks sane. Delete scratch.

- [ ] **Step 5: Verify** — `pnpm exec tsc --noEmit` + `pnpm lint` clean.

- [ ] **Step 6: CHECKPOINT** — report a run produced files. Stop for review/commit.

---

### Task 7: API routes

**Files:**
- Create: `app/api/runs/route.ts`, `app/api/runs/[id]/route.ts`, `app/api/runs/[id]/stream/route.ts`, `app/api/presets/route.ts`

**Interfaces:**
- Consumes: `startRun`, `store`, `run-registry`.
- Produces HTTP:
  - `POST /api/runs` `{ suite, siteA, siteB, presetId }` → `{ id }` (validates base URLs are parseable http(s) URLs; 400 otherwise).
  - `GET /api/runs` → `RunMeta[]`.
  - `GET /api/runs/:id` → `{ meta, comparison }`.
  - `GET /api/runs/:id/stream` → SSE, `event: progress` with JSON `RunProgress`; closes on `done`.
  - `GET /api/presets` → `Preset[]`; `POST /api/presets` `Preset` → `{ ok: true }`.
- All route handlers add `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'`.

- [ ] **Step 1: Write `app/api/runs/route.ts`** — POST validates with `new URL(baseURL)` (reject non-http/https), calls `startRun`, returns `{ id }`. GET returns `listRuns()`.

- [ ] **Step 2: Write `app/api/runs/[id]/route.ts`** — returns `{ meta: getRunMeta(id), comparison: getComparison(id) }` (comparison may be null while running).

- [ ] **Step 3: Write `app/api/runs/[id]/stream/route.ts`** — return a `ReadableStream` writing `data: <json>\n\n` frames. On subscribe, immediately push `getLast(id)`; forward each `emit`; when phase `done`, push a final frame and close. Set headers `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.

- [ ] **Step 4: Write `app/api/presets/route.ts`** — GET `listPresets()`; POST parses a `Preset` body and `upsertPreset`.

- [ ] **Step 5: Manual verify**

```bash
curl -s localhost:3000/api/presets | head
curl -s -X POST localhost:3000/api/runs -H 'content-type: application/json' \
  -d '{"suite":"seo","siteA":{"label":"ftl","baseURL":"https://.../en-us/"},"siteB":{"label":"react","baseURL":"https://.../en-us/dulcolax/us/"},"presetId":"dulcolax-seo"}'
```
Expected: presets list returns two; POST returns an `id`; a run dir appears. Hit `curl -N localhost:3000/api/runs/<id>/stream` and see progress frames.

- [ ] **Step 6: Verify** — `pnpm exec tsc --noEmit` + `pnpm lint` clean.

- [ ] **Step 7: CHECKPOINT** — report API works via curl. Stop for review/commit.

---

### Task 8: New-comparison form UI

**Files:**
- Create: `components/ComparisonForm.tsx`; Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `GET /api/presets`, `POST /api/runs`.
- Produces: on submit, navigates to `/runs/<id>`.

- [ ] **Step 1: Write `components/ComparisonForm.tsx`** (client component) — fields: Site A label + base URL, Site B label + base URL, suite toggle (`seo`/`datalayer`), preset `<select>` filtered to the chosen suite (fetched from `/api/presets`). On submit POST `/api/runs`, then `router.push('/runs/'+id)`. Disable submit unless both base URLs parse as URLs and a preset is chosen. Show inline error on 400.

- [ ] **Step 2: Modify `app/page.tsx`** — render `<ComparisonForm />` under an `h1` and a link to `/runs`.

- [ ] **Step 3: Manual verify** — open `/`, pick SEO + dulcolax-seo, enter the two base URLs, submit → lands on `/runs/<id>`.

- [ ] **Step 4: Verify** — typecheck + lint clean.

- [ ] **Step 5: CHECKPOINT** — report. Stop for review/commit.

---

### Task 9: Live run progress UI

**Files:**
- Create: `components/RunProgress.tsx`; Modify: `app/runs/[id]/page.tsx` (create)

**Interfaces:**
- Consumes: `GET /api/runs/:id`, `GET /api/runs/:id/stream`.
- Produces: while `meta.status==='running'`, shows streamed progress; when done, renders the comparison viewer (Task 10).

- [ ] **Step 1: Create `app/runs/[id]/page.tsx`** (client) — fetch `/api/runs/:id` on mount. If `meta.status==='running'`, render `<RunProgress id={id} />`. If `done`, render `<ComparisonViewer meta comparison />`. If `error`, show `meta.error`.

- [ ] **Step 2: Write `components/RunProgress.tsx`** — open an `EventSource('/api/runs/'+id+'/stream')`, show `capturing {site} — {label} ({pageIndex}/{total})` with a progress bar; on the `done` frame, `router.refresh()` (re-fetch to render the viewer). Fallback: if `EventSource` errors, poll `/api/runs/:id` every 1.5s until `status!=='running'`.

- [ ] **Step 3: Manual verify** — start a run from `/`, watch progress advance page-by-page, then flip to results.

- [ ] **Step 4: Verify** — typecheck + lint clean.

- [ ] **Step 5: CHECKPOINT** — report. Stop for review/commit.

---

### Task 10: Comparison viewer (SEO)

**Files:**
- Create: `components/ComparisonViewer.tsx`, `components/DiffTable.tsx`, `components/StatusPill.tsx`

**Interfaces:**
- Consumes: `RunMeta`, `ComparisonResult`, `rowsToCsv`.
- Produces: rendered SEO comparison; CSV download.

- [ ] **Step 1: Write `components/StatusPill.tsx`** — colored badge by status: green `match`/`match (none)`, amber `value_diff`, blue `*_only`, gray others.

- [ ] **Step 2: Write `components/DiffTable.tsx`** — props `{ rows: DiffRow[]; siteALabel; siteBLabel }`. Group rows by `page`. Within a page render a table: columns key / Site A value / Site B value / status. `match` rows collapsed behind a "show N matches" toggle per page (default hidden). Long values wrap; preserve `\n`.

- [ ] **Step 3: Write `components/ComparisonViewer.tsx`** — header with `siteA.label` vs `siteB.label`, suite, timestamp, and summary counts (match/value_diff/a_only/b_only) as clickable filter chips. A status filter + free-text page filter. For **SEO**, sub-tabs Hreflang / Schema / Metadata that filter `rows` by `section` and feed `DiffTable`. A "Download CSV" button per active tab calling `rowsToCsv(filteredRows, ['page','url','section','schemaType','field'/*→key*/,'valueA','valueB','status'])` and triggering a blob download named `compare-<suite>-<section>.csv`.

- [ ] **Step 4: Oracle verify** — run a full `dulcolax-seo` comparison against the same two base URLs the existing CSVs used (`mon-uat` / `mon-stg` per the report filenames). Confirm the viewer's metadata diff count matches the corresponding existing CSV's non-`match` row count (same check as Task 4, now visually).

- [ ] **Step 5: Verify** — typecheck + lint clean; the viewer renders with matches collapsed and diffs visible.

- [ ] **Step 6: CHECKPOINT** — report SEO end-to-end working with oracle parity. Stop for review/commit.

---

### Task 11: Run history list

**Files:**
- Create: `app/runs/page.tsx`

**Interfaces:**
- Consumes: `GET /api/runs`.

- [ ] **Step 1: Write `app/runs/page.tsx`** — fetch `/api/runs`, render a table: created-at, suite, `siteA.label` vs `siteB.label`, status, and summary counts; each row links to `/runs/<id>`. Link back to `/` ("New comparison").

- [ ] **Step 2: Manual verify** — after a couple of runs, `/runs` lists them newest-first; clicking opens the viewer.

- [ ] **Step 3: Verify** — typecheck + lint clean.

- [ ] **Step 4: CHECKPOINT** — SEO milestone complete (capture → view → history, oracle-verified). Stop for review/commit.

---

### Task 12: Port dataLayer capture helpers

**Files:**
- Create: `lib/capture/datalayer.ts`, `lib/capture/interact.ts`

**Interfaces:**
- Consumes: `playwright` `Page`, `Interaction`.
- Produces:
  - `installDatalayerCapture(page): Promise<void>`, `acceptCookies(page): Promise<void>`, `collectEvents(page): Promise<any[]>` (ported from `datalayer.ts`).
  - `runInteractions(page, interactions: Interaction[], label?): Promise<string[]>` (ported from `interact.ts`).

- [ ] **Step 1: Read `spa-poc/.../datalayer/helpers/datalayer.ts`** (not yet read in this plan; open it) and port its three exports verbatim into `lib/capture/datalayer.ts`, changing the import to `import type { Page } from 'playwright';`.

- [ ] **Step 2: Port `lib/capture/interact.ts`** verbatim from `spa-poc/.../datalayer/helpers/interact.ts`, changing the import to `import type { Page } from 'playwright';` and `import type { Interaction } from '@/lib/types';`. Logic (click/select/fill/focus/video/seek/scroll-to-top/wait) unchanged.

- [ ] **Step 3: Verify** — `pnpm exec tsc --noEmit` clean.

- [ ] **Step 4: CHECKPOINT** — report. Stop for review/commit.

---

### Task 13: Port dataLayer compare engine (returns objects)

**Files:**
- Create: `lib/compare/datalayer-compare.ts`

**Interfaces:**
- Consumes: `flatten`, `DiffRow`, `ComparisonResult`.
- Produces: `compareDatalayer(reportsA, reportsB, siteKeyA, siteKeyB): ComparisonResult`.

- [ ] **Step 1: Port `spa-poc/.../datalayer/compare.mjs`** into `lib/compare/datalayer-compare.ts`. Preserve verbatim: `SKIP_EVENTS`, `KNOWN_OVERFIRE_EVENTS`, `normalizeWs`, the full `classifyReason(status, event, key, page)` function, and the event-grouping / occurrence-pairing / over-fire / whitespace logic (lines 189-294). Change only the output: push `DiffRow` objects (`{ page, url, event, occurrence, key, valueA, valueB, status, reason }`) instead of CSV cell arrays, and accumulate `summary` (map `match`/`match (...)` → `match`; `value_diff` → `value_diff`; `${siteKeyA}_only` → `a_only`; `${siteKeyB}_only` → `b_only`; else `other`). `siteKeyA`/`siteKeyB` are the site labels passed in (used in status strings and `classifyReason`). Set `url` from the page report's `url`.

- [ ] **Step 2: Oracle-verify** — throwaway `scripts/oracle-dl.mjs` (delete after) reading `spa-poc/.../datalayer/reports/dulcolax-ftl` and `dulcolax-react`, calling `compareDatalayer(...,'dulcolax.ftl','dulcolax.react')`. Compare `summary.match/value_diff/(a_only+b_only)` against the existing `datalayer/reports/compare-dulcolax-ftl-vs-dulcolax-react.csv`: count its rows by status bucket and confirm they match. Run `pnpm exec tsx scripts/oracle-dl.mjs`; delete after.

- [ ] **Step 3: Verify** — typecheck clean; oracle buckets match the CSV.

- [ ] **Step 4: CHECKPOINT** — report dataLayer oracle parity. Stop for review/commit.

---

### Task 14: Runner — dataLayer suite branch

**Files:**
- Modify: `lib/runner.ts`

**Interfaces:**
- Produces: `execute` branches on `meta.suite`; `captureDatalayerSite` mirrors the current spec sequence.

- [ ] **Step 1: Add `captureDatalayerSite`** to `lib/runner.ts` — per page: `installDatalayerCapture(page)` → `page.goto(url,{waitUntil:'networkidle'})` → `acceptCookies(page)` → wait `SETTLE_MS` (2000) → gradual scroll in 6 steps (copy the loop from the datalayer spec) → if `entry.interactions?.length` run `runInteractions` and capture `failedInteractions` → `collectEvents`, filtering `entry.skipEvents`. Slug rule for dataLayer uses the **label** (matching the current spec): `entry.label.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')`. Write report object `{ url, label, capturedAt, failedInteractions?, events }`. Wrap each page in try/catch (record `{error, events:[]}` and continue).

- [ ] **Step 2: Branch `execute`** — if `meta.suite==='datalayer'`, use `captureDatalayerSite` and `compareDatalayer`; else the SEO path. Keep progress emits identical in shape.

- [ ] **Step 3: Manual verify** — start a dataLayer run (preset `dulcolax-datalayer`, the two dulcolax base URLs) from the UI; confirm it completes and writes `comparison.json` with dataLayer-shaped rows. Note: dataLayer runs are slow (interactions + waits); expect minutes.

- [ ] **Step 4: Verify** — typecheck + lint clean.

- [ ] **Step 5: CHECKPOINT** — report. Stop for review/commit.

---

### Task 15: Viewer — dataLayer rendering

**Files:**
- Modify: `components/ComparisonViewer.tsx`, `components/DiffTable.tsx`

**Interfaces:**
- Produces: dataLayer grouping (event → occurrence → key) + reason column; over-fire/whitespace statuses styled.

- [ ] **Step 1: Extend `ComparisonViewer`** — when `suite==='datalayer'`, skip the SEO sub-tabs; render a single grouped view. Summary chips add `match (over-fire)` and `match (whitespace)` buckets (count them under match but show as a note). CSV columns: `['page','event','occurrence','key','valueA','valueB','status','reason']`.

- [ ] **Step 2: Extend `DiffTable`** — accept an optional `mode:'seo'|'datalayer'`. In datalayer mode, group rows by `page` then by `event` (show occurrence), and render an extra "reason" column (muted text). `StatusPill` handles the `match (...)` variants (treat any status starting with `match` as green).

- [ ] **Step 3: Manual verify** — open a completed dataLayer run; confirm events group with occurrences, reasons show, over-fire rows read as green matches, real `value_diff`/`*_only` stand out.

- [ ] **Step 4: Verify** — typecheck + lint clean.

- [ ] **Step 5: CHECKPOINT** — dataLayer end-to-end complete. Stop for review/commit.

---

### Task 16: Preset editor

**Files:**
- Create: `app/presets/page.tsx`, `components/PresetEditor.tsx`

**Interfaces:**
- Consumes: `GET /api/presets`, `POST /api/presets`.

- [ ] **Step 1: Write `components/PresetEditor.tsx`** (client) — pick a preset from a dropdown (or "New"), edit `name` and the `pages` list: each page row has `label`, `path`, and — when the preset `suite==='datalayer'` — an editable `interactions` list (type dropdown + selector/value/ms/percent fields per the `Interaction` union) and a comma-separated `skipEvents`. Add/remove page and interaction rows. "Save" POSTs the `Preset` (generate a slug `id` from name for new presets; keep existing `id` when editing). Validate: non-empty name, at least one page, each interaction has required fields for its type.

- [ ] **Step 2: Write `app/presets/page.tsx`** — render `<PresetEditor />`; link from `/` and `/runs`.

- [ ] **Step 3: Manual verify** — create a new SEO preset with 2 paths, save, then start a run using it from `/`. Edit `dulcolax-datalayer`, add an interaction, save, confirm it round-trips (reopen shows the change).

- [ ] **Step 4: Verify** — typecheck + lint clean.

- [ ] **Step 5: CHECKPOINT** — report editable presets working. Stop for review/commit.

---

### Task 17: Error-handling polish + README

**Files:**
- Modify: `components/ComparisonForm.tsx`, `components/ComparisonViewer.tsx`, `lib/runner.ts`; Create: `README.md`

**Interfaces:** none new.

- [ ] **Step 1: Base URL validation feedback** — in `ComparisonForm`, show a clear inline message when the API returns 400 (invalid URL). Confirm `startRun`'s "preset not found" and per-run errors surface on `/runs/[id]` via `meta.error`.

- [ ] **Step 2: Browser-launch failure guidance** — in `runner.ts`, catch a `chromium.launch()` failure and set `meta.error` to include "Run `pnpm exec playwright install chromium`". Verify by temporarily renaming the browser cache is optional; at minimum ensure the error string is wired.

- [ ] **Step 3: Warnings surfaced in viewer** — populate `meta.warnings` and render it. In `execute` (both suites), after capturing both site reports, build `warnings: Record<string, string[]>` keyed by page label: for each page report on either side, if it has an `error` string, push `"<A|B>: capture error — <message>"`; for dataLayer, if it has a non-empty `failedInteractions`, push `"<A|B>: failed interactions — <joined>"`. Store on `meta.warnings` before the final `emit({phase:'done'})`. In `ComparisonViewer`, if `meta.warnings` is non-empty, render a small amber banner listing each `pageLabel` and its messages above the summary.

- [ ] **Step 4: Write `README.md`** — how to install (`pnpm install`, `pnpm exec playwright install chromium`), run (`pnpm dev`), and the workflow (enter base URLs, pick suite + preset, Run, view, download CSV, edit presets). Note it is local-only and that `data/` holds presets + run history.

- [ ] **Step 5: Verify** — typecheck + lint clean; manually trigger an invalid-URL submit and an unreachable-base-URL run; confirm both surface readable errors.

- [ ] **Step 6: CHECKPOINT** — v1 complete. Stop for review/commit.

---

## Self-review notes

- **Spec coverage:** SEO capture+diff (T3,4,6,10) ✓; dataLayer capture+diff (T12,13,14,15) ✓; UI-entered base URLs (T7 validation, T8 form) ✓; button-triggered runs (T7,8,9) ✓; editable presets (T5 seed, T16 editor) ✓; run history (T5 store, T7 API, T11 UI) ✓; JSON persistence (T5) ✓; CSV export retained (T4 csv.ts, T10/T15 download) ✓; local-only Playwright core (T1,6) ✓; error handling (T6 per-page, T17) ✓; oracle verification vs existing CSVs (T4,10,13) ✓; no unit-test framework (global constraint) ✓.
- **Deferred by design:** comparison-viewer visual mockup (do a quick browser-companion mock before Task 10 if desired); sitemap auto-discovery (out of scope); hosting (out of scope).
- **Type consistency:** `DiffRow`, `Preset`, `PageEntry`, `Interaction`, `RunMeta`, `ComparisonResult` are defined once in `lib/types.ts` (T2) and reused everywhere. Note `DiffRow` uses `key` for what the SEO CSV called `field`; the CSV download step maps the column header accordingly.
```
