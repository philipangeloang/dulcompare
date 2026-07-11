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
  section?: 'hreflang' | 'schema' | 'metadata';
  schemaType?: string;
  event?: string;
  occurrence?: string;
  key: string;
  valueA: string;
  valueB: string;
  status: string;
  reason?: string;
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
  warnings?: Record<string, string[]>;
}
