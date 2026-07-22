function csvCell(v: unknown): string {
  if (v === undefined || v === null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(String);
  const body = rows.map((r) => columns.map((c) => csvCell(r[c])).join(','));
  return [header.join(','), ...body].join('\n');
}
