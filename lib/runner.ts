import { randomUUID } from 'crypto';
import type { Browser } from 'playwright';
import { withBrowser } from '@/lib/capture/browser';
import * as seo from '@/lib/capture/seo';
import { installDatalayerCapture, acceptCookies, collectEvents } from '@/lib/capture/datalayer';
import { runInteractions } from '@/lib/capture/interact';
import { compareSeo } from '@/lib/compare/seo-compare';
import { compareDatalayer } from '@/lib/compare/datalayer-compare';
import * as store from '@/lib/store';
import * as registry from '@/lib/run-registry';
import type { RunMeta, SiteRef, Suite, Preset, RunProgress } from '@/lib/types';

const SCROLL_STEPS = 6;
const SETTLE_MS = 2000;

const slug = (p: string) => (p || 'home').replace(/\//g, '-').replace(/[^a-z0-9-]/g, '');

// Join base (ends with or without trailing slash) + path (no leading slash) with exactly one '/'.
function joinUrl(baseURL: string, path: string): string {
  const base = baseURL.endsWith('/') ? baseURL : baseURL + '/';
  return base + path.replace(/^\//, '');
}

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
  void execute(meta, preset).catch(async (e) => {
    meta.status = 'error';
    meta.error = e instanceof Error ? e.message : String(e);
    if (/Executable doesn.t exist|playwright install/i.test(meta.error)) {
      meta.error += ' — run `pnpm exec playwright install chromium`';
    }
    await store.saveRunMeta(meta);
    registry.setDone(id);
  });
  return id;
}

async function execute(meta: RunMeta, preset: Preset): Promise<void> {
  const emit = async (p: RunProgress) => { meta.progress = p; registry.emit(meta.id, p); await store.saveRunMeta(meta); };
  await withBrowser(async (browser) => {
    if (meta.suite === 'seo') {
      const reportsA = await captureSeoSite(browser, meta.siteA.baseURL, preset, 'A', emit);
      await store.saveSiteReport(meta.id, 'a', reportsA);
      const reportsB = await captureSeoSite(browser, meta.siteB.baseURL, preset, 'B', emit);
      await store.saveSiteReport(meta.id, 'b', reportsB);
      await emit({ phase: 'compare' });
      const comparison = compareSeo(reportsA, reportsB, meta.siteA.label, meta.siteB.label);
      await store.saveComparison(meta.id, comparison);
      meta.warnings = collectWarnings(reportsA, reportsB, meta.siteA.label, meta.siteB.label);
    } else {
      const reportsA = await captureDatalayerSite(browser, meta.siteA.baseURL, preset, 'A', emit);
      await store.saveSiteReport(meta.id, 'a', reportsA);
      const reportsB = await captureDatalayerSite(browser, meta.siteB.baseURL, preset, 'B', emit);
      await store.saveSiteReport(meta.id, 'b', reportsB);
      await emit({ phase: 'compare' });
      const comparison = compareDatalayer(reportsA, reportsB, meta.siteA.label, meta.siteB.label);
      await store.saveComparison(meta.id, comparison);
      meta.warnings = collectWarnings(reportsA, reportsB, meta.siteA.label, meta.siteB.label);
    }
  });
  meta.status = 'done';
  await emit({ phase: 'done' });
  registry.setDone(meta.id);
}

interface PageReport {
  label: string;
  error?: string;
  failedInteractions?: string[];
}

/** Builds meta.warnings from both sites' page reports: capture errors and failed scripted interactions, keyed by page label. */
function collectWarnings(
  reportsA: Record<string, unknown>,
  reportsB: Record<string, unknown>,
  siteALabel: string,
  siteBLabel: string,
): Record<string, string[]> {
  const warnings: Record<string, string[]> = {};
  const add = (label: string, message: string) => {
    (warnings[label] ??= []).push(message);
  };
  const scan = (reports: Record<string, unknown>, siteLabel: string) => {
    for (const raw of Object.values(reports)) {
      const report = raw as PageReport;
      if (report.error) add(report.label, `${siteLabel}: capture error — ${report.error}`);
      if (report.failedInteractions?.length) {
        add(report.label, `${siteLabel}: failed interactions — ${report.failedInteractions.join(', ')}`);
      }
    }
  };
  scan(reportsA, siteALabel);
  scan(reportsB, siteBLabel);
  return warnings;
}

async function captureSeoSite(
  browser: Browser, baseURL: string, preset: Preset, side: 'A' | 'B',
  emit: (p: RunProgress) => Promise<void>,
): Promise<Record<string, unknown>> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const reports: Record<string, unknown> = {};
  const usedSlugs = new Set<string>();
  try {
    for (let i = 0; i < preset.pages.length; i++) {
      const entry = preset.pages[i];
      await emit({ phase: 'capture', site: side, pageIndex: i + 1, total: preset.pages.length, label: entry.label });
      const url = joinUrl(baseURL, entry.path);
      let seoSlug = slug(entry.path);
      if (usedSlugs.has(seoSlug)) seoSlug = `${seoSlug}-${i}`;
      usedSlugs.add(seoSlug);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        reports[`${seoSlug}.json`] = {
          url, label: entry.label, capturedAt: new Date().toISOString(),
          hreflang: await seo.extractHreflang(page),
          schema: await seo.extractSchema(page),
          metadata: await seo.extractMetadata(page),
        };
      } catch (e) {
        reports[`${seoSlug}.json`] = {
          url, label: entry.label, error: e instanceof Error ? e.message : String(e),
          hreflang: [], schema: [], metadata: {},
        };
      }
    }
  } finally {
    await ctx.close();
  }
  return reports;
}

async function captureDatalayerSite(
  browser: Browser, baseURL: string, preset: Preset, side: 'A' | 'B',
  emit: (p: RunProgress) => Promise<void>,
): Promise<Record<string, unknown>> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const reports: Record<string, unknown> = {};
  const usedSlugs = new Set<string>();
  try {
    for (let i = 0; i < preset.pages.length; i++) {
      const entry = preset.pages[i];
      await emit({ phase: 'capture', site: side, pageIndex: i + 1, total: preset.pages.length, label: entry.label });
      const url = joinUrl(baseURL, entry.path);
      let dlSlug = entry.label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      if (usedSlugs.has(dlSlug)) dlSlug = `${dlSlug}-${i}`;
      usedSlugs.add(dlSlug);
      try {
        await installDatalayerCapture(page);
        await page.goto(url, { waitUntil: 'networkidle' });
        await acceptCookies(page);
        await page.waitForTimeout(SETTLE_MS);

        const height = await page.evaluate(() => document.body.scrollHeight);
        for (let s = 1; s <= SCROLL_STEPS; s++) {
          await page.evaluate(y => window.scrollTo({ top: y, behavior: 'smooth' }), Math.round((height / SCROLL_STEPS) * s));
          await page.waitForTimeout(600);
        }
        await page.waitForTimeout(SETTLE_MS);

        let failedInteractions: string[] = [];
        if (entry.interactions?.length) {
          failedInteractions = await runInteractions(page, entry.interactions, entry.label);
          await page.waitForTimeout(SETTLE_MS);
        }

        const skip = new Set(entry.skipEvents ?? []);
        const all = await collectEvents(page);
        const events = skip.size ? all.filter(e => !skip.has(e.event)) : all;

        reports[`${dlSlug}.json`] = {
          url, label: entry.label, capturedAt: new Date().toISOString(),
          failedInteractions: failedInteractions.length ? failedInteractions : undefined,
          events,
        };
      } catch (e) {
        reports[`${dlSlug}.json`] = {
          url, label: entry.label, error: e instanceof Error ? e.message : String(e), events: [],
        };
      }
    }
  } finally {
    await ctx.close();
  }
  return reports;
}
