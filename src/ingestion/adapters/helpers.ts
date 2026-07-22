// Shared adapter validation helpers. Defensive, deterministic parsing of raw provider
// rows; a malformed row yields `null` (the adapter discards it with a warning) rather
// than throwing into the pipeline.

export function asRows(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null);
}

export function str(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function num(row: Record<string, unknown>, key: string): number | null {
  const v = row[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function bool(row: Record<string, unknown>, key: string): boolean {
  return row[key] === true;
}
