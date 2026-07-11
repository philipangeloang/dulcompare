import type { ComparisonResult, ComparisonSummary, DiffRow } from '@/lib/types';
import { flatten } from '@/lib/compare/flatten';
import { METADATA_FIELDS, METADATA_URL_FIELDS } from '@/lib/compare/metadata-fields';

/** Extract pathname from a URL string, stripping origin for cross-env comparison */
function normalizePath(href: string): string {
  try {
    return new URL(href).pathname;
  } catch {
    return href; // already a path, or malformed — use as-is
  }
}

function normalizeMetaValue(field: string, value: unknown): string | string[] {
  if (field === 'ogLocaleAlternate') {
    const arr = Array.isArray(value) ? value : [];
    return [...new Set(arr.map((v) => String(v).trim()).filter(Boolean))].sort();
  }
  const s = String(value ?? '').trim();
  if (METADATA_URL_FIELDS.has(field) && s) {
    return normalizePath(s);
  }
  return s;
}

function formatMetaCsvValue(field: string, normalized: string | string[]): string {
  if (field === 'ogLocaleAlternate') {
    return Array.isArray(normalized) ? normalized.join('\n') : '';
  }
  return typeof normalized === 'string' ? normalized : '';
}

export function compareSeo(
  reportsA: Record<string, any>,
  reportsB: Record<string, any>,
  siteKeyA: string,
  siteKeyB: string,
): ComparisonResult {
  const summary: ComparisonSummary = { match: 0, value_diff: 0, a_only: 0, b_only: 0, other: 0 };
  const rows: DiffRow[] = [];

  function pushRow(row: DiffRow) {
    rows.push(row);
    if (row.status.startsWith('match')) summary.match++;
    else if (row.status === 'value_diff') summary.value_diff++;
    else if (row.status === `${siteKeyA}_only`) summary.a_only++;
    else if (row.status === `${siteKeyB}_only`) summary.b_only++;
    else summary.other++;
  }

  const allFiles = new Set([...Object.keys(reportsA), ...Object.keys(reportsB)]);
  const sortedFiles = [...allFiles].sort();

  // ── Hreflang compare ─────────────────────────────────────────────────────
  for (const file of sortedFiles) {
    const dataA = reportsA[file];
    const dataB = reportsB[file];
    const page = (dataA ?? dataB).label;
    const url = (dataA ?? dataB).url;

    const hrefsA: string[] = (dataA?.hreflang ?? []).map((e: any) => normalizePath(e.href));
    const hrefsB: string[] = (dataB?.hreflang ?? []).map((e: any) => normalizePath(e.href));

    if (hrefsA.length === 0 && hrefsB.length === 0) {
      pushRow({ section: 'hreflang', page, url, key: 'hreflang', valueA: '', valueB: '', status: 'match (none)' });
      continue;
    }

    const setA = new Set(hrefsA);
    const setB = new Set(hrefsB);
    const missingInB = hrefsA.filter((h) => !setB.has(h));
    const extraInB = hrefsB.filter((h) => !setA.has(h));
    const status = missingInB.length === 0 && extraInB.length === 0 ? 'match' : 'has_diff';

    pushRow({
      section: 'hreflang',
      page,
      url,
      key: 'hreflang',
      valueA: hrefsA.join('\n'),
      valueB: hrefsB.join('\n'),
      status,
    });

    for (const h of missingInB) {
      pushRow({ section: 'hreflang', page, url, key: h, valueA: h, valueB: '', status: `${siteKeyA}_only` });
    }
    for (const h of extraInB) {
      pushRow({ section: 'hreflang', page, url, key: h, valueA: '', valueB: h, status: `${siteKeyB}_only` });
    }
  }

  // ── Schema compare ───────────────────────────────────────────────────────
  for (const file of sortedFiles) {
    const dataA = reportsA[file];
    const dataB = reportsB[file];
    const page = (dataA ?? dataB).label;
    const url = (dataA ?? dataB).url;

    const blocksA: any[] = dataA?.schema ?? [];
    const blocksB: any[] = dataB?.schema ?? [];

    if (blocksA.length === 0 && blocksB.length === 0) {
      pushRow({ section: 'schema', page, url, schemaType: '', key: '(none)', valueA: '', valueB: '', status: 'match (none)' });
      continue;
    }

    // Match blocks by @type, falling back to positional index
    const usedB = new Set<number>();
    const pairs: [any, any][] = [];

    for (let i = 0; i < blocksA.length; i++) {
      const typeA = Array.isArray(blocksA[i]['@type']) ? blocksA[i]['@type'][0] : blocksA[i]['@type'];
      // Try to find a matching @type in B that hasn't been used yet
      const matchIdx = blocksB.findIndex((b, j) => {
        if (usedB.has(j)) return false;
        const typeB = Array.isArray(b['@type']) ? b['@type'][0] : b['@type'];
        return typeB === typeA;
      });
      if (matchIdx !== -1) {
        usedB.add(matchIdx);
        pairs.push([blocksA[i], blocksB[matchIdx]]);
      } else {
        pairs.push([blocksA[i], null]);
      }
    }

    // Remaining B blocks with no A match
    for (let j = 0; j < blocksB.length; j++) {
      if (!usedB.has(j)) {
        pairs.push([null, blocksB[j]]);
      }
    }

    for (const [blockA, blockB] of pairs) {
      const typeA = blockA ? (Array.isArray(blockA['@type']) ? blockA['@type'].join('/') : (blockA['@type'] ?? '?')) : '';
      const typeB = blockB ? (Array.isArray(blockB['@type']) ? blockB['@type'].join('/') : (blockB['@type'] ?? '?')) : '';

      if (!blockA || !blockB) {
        const existing = blockA ?? blockB;
        const flat = flatten(existing);
        const status = blockA ? `${siteKeyA}_only` : `${siteKeyB}_only`;
        for (const key of Object.keys(flat).sort()) {
          pushRow({
            section: 'schema',
            page,
            url,
            schemaType: typeA || typeB,
            key,
            valueA: blockA ? String(flat[key] ?? '') : '',
            valueB: blockB ? String(flat[key] ?? '') : '',
            status,
          });
        }
        continue;
      }

      const flatA = flatten(blockA);
      const flatB = flatten(blockB);
      const allKeys = new Set([...Object.keys(flatA), ...Object.keys(flatB)]);

      for (const key of [...allKeys].sort()) {
        const vA = flatA[key];
        const vB = flatB[key];
        const status =
          vA === undefined
            ? `${siteKeyB}_only`
            : vB === undefined
              ? `${siteKeyA}_only`
              : String(vA) === String(vB)
                ? 'match'
                : 'value_diff';
        pushRow({
          section: 'schema',
          page,
          url,
          schemaType: typeA || typeB,
          key,
          valueA: vA !== undefined ? String(vA) : '',
          valueB: vB !== undefined ? String(vB) : '',
          status,
        });
      }
    }
  }

  // ── Metadata compare ─────────────────────────────────────────────────────
  for (const file of sortedFiles) {
    const dataA = reportsA[file];
    const dataB = reportsB[file];
    const page = (dataA ?? dataB).label;
    const url = (dataA ?? dataB).url;
    const metaA = dataA?.metadata ?? {};
    const metaB = dataB?.metadata ?? {};

    for (const field of METADATA_FIELDS) {
      const normA = normalizeMetaValue(field, metaA[field]);
      const normB = normalizeMetaValue(field, metaB[field]);

      let status: string;
      if (field === 'ogLocaleAlternate') {
        const arrA = normA as string[];
        const arrB = normB as string[];
        const emptyA = arrA.length === 0;
        const emptyB = arrB.length === 0;
        if (emptyA && emptyB) {
          status = 'match (none)';
        } else if (emptyA) {
          status = `${siteKeyB}_only`;
        } else if (emptyB) {
          status = `${siteKeyA}_only`;
        } else {
          const same = arrA.length === arrB.length && arrA.every((v, i) => v === arrB[i]);
          status = same ? 'match' : 'value_diff';
        }
      } else {
        const emptyA = normA === '';
        const emptyB = normB === '';
        if (emptyA && emptyB) {
          status = 'match (none)';
        } else if (emptyA) {
          status = `${siteKeyB}_only`;
        } else if (emptyB) {
          status = `${siteKeyA}_only`;
        } else {
          status = normA === normB ? 'match' : 'value_diff';
        }
      }

      pushRow({
        section: 'metadata',
        page,
        url,
        key: field,
        valueA: formatMetaCsvValue(field, normA),
        valueB: formatMetaCsvValue(field, normB),
        status,
      });
    }
  }

  return { summary, rows };
}
