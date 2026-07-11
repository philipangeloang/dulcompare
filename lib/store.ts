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
export const deletePreset = (id: string) => fs.rm(path.join(PRESETS, `${id}.json`), { force: true });

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
