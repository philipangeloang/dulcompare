# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

dulcompare is a local Next.js (App Router) tool that captures SEO metadata and
GTM `dataLayer` events from two live sites via Playwright, diffs them, and
shows the result in a UI. It replaces the old spa-poc Playwright test suites
(`opl-frontend/tests/seo`, `opl-frontend/tests/datalayer`) and their CSV
output with a form → run → live progress → diff viewer → history → preset
editor flow. See `README.md` for the user-facing workflow.

## Layout

- `lib/types.ts` — all shared types (`Suite`, `Preset`, `PageEntry`, `RunMeta`,
  `DiffRow`, etc). Start here when tracing data shapes.
- `lib/labels.ts` — `suiteLabel()`, the single place that maps `Suite` to its
  display name ("SEO" / "dataLayer"). Use it anywhere a suite is shown.
- `lib/capture/` — Playwright capture helpers (`seo.ts`, `datalayer.ts`,
  `interact.ts`, `browser.ts`). These are verbatim ports of the spa-poc test
  helpers and are intentionally kept byte-identical where noted in code
  comments — don't "clean up" their `any` usage or control flow.
- `lib/compare/` — pure diff logic (`seo-compare.ts`, `datalayer-compare.ts`),
  also ported from the spa-poc `compare.mjs` scripts, plus `csv.ts` for CSV
  export and `flatten.ts` / `metadata-fields.ts` helpers.
- `lib/runner.ts` — orchestrates a run: capture site A, capture site B,
  compare, persist. Emits progress via `lib/run-registry.ts` (in-memory
  pub/sub, one entry per run id) for the SSE progress stream.
- `lib/store.ts` — all filesystem persistence, reading/writing under `data/`.
- `app/` — routes: `/` (new comparison form), `/runs` (history), `/runs/[id]`
  (progress + diff viewer), `/presets` (preset editor), plus `app/api/*` for
  presets, runs, and the run SSE stream.
- `components/` — one component per screen/concern (`ComparisonForm`,
  `ComparisonViewer`, `DiffTable`, `RunProgress`, `PresetEditor`,
  `StatusPill`, `NavLinks`). `StatusPill` + `app/globals.css` are the shared
  design system (`.card`, `.btn`, `.input`, `.pill`, color tokens) — reuse
  them rather than inventing new styles per screen.

## Data / persistence

Everything lives under `data/` (gitignored): `data/presets/*.json` (seeded
from `lib/seed-presets.ts` on first read if empty — never delete the two seed
presets, `dulcolax-seo` / `dulcolax-datalayer`, they're the working example)
and `data/runs/<id>/` (`meta.json`, `site-a.json`, `site-b.json`,
`comparison.json`). There is no database.

## Verification — no unit-test framework

This project deliberately has no vitest/jest/test files. Verify changes with:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

...plus a manual smoke pass in the browser (start the app, run through the
form/run/viewer flow). Do not add a test framework or test files unless
explicitly asked.

## Running the app

`pnpm dev` starts Next on port 3000 by default. If port 3000 is already in
use by something else on your machine, don't kill it — run on an alternate
port instead:

```bash
pnpm exec next dev -p 3010
```

## Conventions

- Path alias `@/*` resolves to the repo root (`lib/...`, `components/...`,
  `app/...`).
- Strict TS. `eslint.config.mjs` carries a few file-scoped
  `no-explicit-any` overrides for the verbatim-ported capture/compare files
  listed above — keep those narrow and don't add new blanket overrides.
- Tailwind v4 (`@import "tailwindcss"` in `app/globals.css`); design tokens
  and shared component classes live there — see the file for the full list
  before adding new colors or one-off styles.
