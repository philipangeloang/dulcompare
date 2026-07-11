# dulcompare

A local web app for capturing SEO metadata and GTM `dataLayer` events from
two site variants (e.g. the legacy FreeMarker site vs. the new React/SPA
site) and diffing them side by side. It's a UI replacement for the
spa-poc Playwright test suites (`opl-frontend/tests/seo` and
`opl-frontend/tests/datalayer`) and their CSV output — same capture and
compare logic, ported into a runnable app with a form, live progress, and a
diff viewer instead of raw CSVs.

## Setup

```bash
pnpm install
pnpm exec playwright install chromium
```

## Run

```bash
pnpm dev
```

Open http://localhost:3000. If port 3000 is already taken by something
else, run on an alternate port instead:

```bash
pnpm exec next dev -p 3010
```

## Workflow

1. **New comparison** (`/`) — enter a label + base URL for Site A and Site B,
   pick a suite (**SEO** or **dataLayer**), and choose a page preset.
2. **Run** — submitting starts a Playwright capture in the background and
   takes you to the run's progress page, which streams live status (which
   site/page is currently being captured) until the run finishes.
3. **Diff viewer** — once done, the same page shows the comparison:
   - **SEO**: tabs for Hreflang / Schema / Metadata, with a per-page summary
     row that collapses to "all fields match" when there's nothing to review,
     and expands to the full field table when there's a diff.
   - **dataLayer**: rows grouped by page then by GTM event, with an
     occurrence column (for events that fire more than once) and a reason
     column explaining non-trivial matches (e.g. over-fire, whitespace-only
     differences).
   - Filter by status (match / value diff / A-only / B-only) or by page name,
     and **Download CSV** for the currently filtered rows.
   - If any page failed to capture, or a scripted interaction (click/fill/
     etc.) failed to find its target element, a **capture warnings** banner
     appears above the summary listing which page and site were affected.
4. **History** (`/runs`) — browse past runs and reopen any of them.
5. **Presets** (`/presets`) — edit the page list for a suite: label, path,
   and (for dataLayer presets) scripted interactions and events to skip.

## Notes

- Local-only tool; there's no auth or deployment target.
- `data/` holds presets and run history as JSON on disk (gitignored). The two
  seed presets (`dulcolax-seo`, `dulcolax-datalayer`) are created
  automatically the first time presets are read if `data/presets/` is empty.
- dataLayer runs are slower than SEO runs — each page is scrolled in steps,
  settled, and then driven through its scripted interactions before events
  are collected, per page, per site.
