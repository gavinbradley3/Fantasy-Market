// A checksum of WHAT the board says, separate from WHEN it was said.
//
// `publication.publishedAt`, `runId` and the export's `generatedAt` change on every run, even a
// byte-identical replay. Comparing whole files would therefore call two identical valuations
// different. This digest covers only the valuation content of each entry, in canonical order,
// so two runs over the same captures at the same as-of produce the same value, and any change to
// any published number changes it.

import { createHash } from 'node:crypto';

/** Fields that carry valuation content. Publication metadata is deliberately absent. */
export const VALUATION_FIELDS = [
  'canonicalId',
  'position',
  'name',
  'team',
  'age',
  'asOf',
  'outputStatus',
  'modelTier',
  'modelVersion',
  'composites',
  'dynastyValue',
  'dynastySurplus',
  'dynastyDepth',
  'dynastyValueSource',
  'dynastyOverallRank',
  'dynastyPositionRank',
  'leagueSchemaId',
  'productionCurveVersion',
  'normalizedInputChecksum',
  'outputChecksum',
] as const;

/** Stable JSON: object keys sorted at every depth. */
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`).join(',')}}`;
}

export function valuationChecksum(entries: readonly Record<string, unknown>[]): string {
  const projected = entries
    .map((e) => Object.fromEntries(VALUATION_FIELDS.map((f) => [f, e[f] ?? null])))
    .sort((a, b) => String(a.canonicalId).localeCompare(String(b.canonicalId)));
  return createHash('sha256').update(stable(projected)).digest('hex');
}
