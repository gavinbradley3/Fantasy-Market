// nflverse provider adapter. nflverse is the audited source for draft capital
// (round / overall pick / draft year), rookie year, and the GSIS join key, plus
// additional cross-provider ids. Its primary key is the GSIS id.

import { isSupportedPosition, type CanonicalStatus } from '@/pipeline/types';
import type {
  AdapterResult,
  ProviderAdapter,
  ProviderRecord,
  RejectedEntry,
} from '@/pipeline/providers/types';
import {
  nflversePlayerSchema,
  type NflversePlayerRaw,
} from '@/pipeline/providers/nflverse/schema';

function optId(v: string | number | null | undefined): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

// nflverse numeric columns may arrive as numbers or numeric strings; blanks are
// empty strings. Return undefined for anything non-finite rather than 0.
function num(v: string | number | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && String(v).trim() !== '' ? n : undefined;
}

function intInRange(
  v: string | number | null | undefined,
  min: number,
  max: number,
): number | undefined {
  const n = num(v);
  if (n === undefined) return undefined;
  const i = Math.trunc(n);
  return i >= min && i <= max ? i : undefined;
}

function mapStatus(raw: string | null | undefined): CanonicalStatus | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (s.includes('sus')) return 'suspended';
  if (s === 'act' || s.includes('active')) return 'active';
  if (s.includes('inactive') || s.includes('cut') || s.includes('ret')) return 'inactive';
  if (s.includes('inj') || s.includes('ir') || s.includes('pup')) return 'injured';
  return undefined; // unknown code → leave absent, never guess 'active'
}

function displayName(p: NflversePlayerRaw): string | undefined {
  const composed = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return p.full_name ?? (composed.length > 0 ? composed : undefined);
}

function toRecord(p: NflversePlayerRaw): ProviderRecord | null {
  const gsis = optId(p.gsis_id);
  if (!gsis) return null; // no primary key
  if (!p.position || !isSupportedPosition(p.position)) return null;
  const status = mapStatus(p.status);
  const team = p.team ?? p.latest_team ?? undefined;
  const draftYear = num(p.draft_year) ?? num(p.entry_year);
  const rec: ProviderRecord = {
    provider: 'nflverse',
    providerPlayerId: gsis,
    crossIds: {
      gsis,
      ...(optId(p.sleeper_id) ? { sleeper: optId(p.sleeper_id) } : {}),
      ...(optId(p.espn_id) ? { espn: optId(p.espn_id) } : {}),
      ...(optId(p.yahoo_id) ? { yahoo: optId(p.yahoo_id) } : {}),
      ...(optId(p.sportradar_id) ? { sportradar: optId(p.sportradar_id) } : {}),
    },
    position: p.position,
    ...(displayName(p) ? { fullName: displayName(p) } : {}),
    ...(team ? { team } : {}),
    ...(p.birth_date ? { birthDate: p.birth_date } : {}),
    ...(num(p.years_exp) !== undefined ? { nflSeasonsCompleted: num(p.years_exp) } : {}),
    ...(num(p.rookie_year) !== undefined ? { rookieYear: num(p.rookie_year) } : {}),
    ...(draftYear !== undefined ? { draftYear } : {}),
    ...(intInRange(p.draft_round, 1, 7) !== undefined
      ? { draftRound: intInRange(p.draft_round, 1, 7) }
      : {}),
    ...(intInRange(p.draft_number, 1, 300) !== undefined
      ? { draftPick: intInRange(p.draft_number, 1, 300) }
      : {}),
    ...(num(p.height) !== undefined ? { heightInches: num(p.height) } : {}),
    ...(num(p.weight) !== undefined ? { weightPounds: num(p.weight) } : {}),
    ...(intInRange(p.jersey_number, 0, 99) !== undefined
      ? { jerseyNumber: intInRange(p.jersey_number, 0, 99) }
      : {}),
    ...(status ? { status } : {}),
  };
  return rec;
}

export const nflverseAdapter: ProviderAdapter = {
  provider: 'nflverse',
  parse(raw: unknown): AdapterResult {
    const rejected: RejectedEntry[] = [];
    const records: ProviderRecord[] = [];
    const seen = new Set<string>();

    if (!Array.isArray(raw)) {
      return {
        provider: 'nflverse',
        records: [],
        rejected: [{ provider: 'nflverse', reason: 'MALFORMED', locator: '<payload>' }],
      };
    }

    raw.forEach((entry, i) => {
      const parsed = nflversePlayerSchema.safeParse(entry);
      if (!parsed.success) {
        rejected.push({ provider: 'nflverse', reason: 'MALFORMED', locator: `row_${i}` });
        return;
      }
      const p = parsed.data;
      const gsis = optId(p.gsis_id);
      if (!gsis) {
        rejected.push({ provider: 'nflverse', reason: 'MISSING_PRIMARY_ID', locator: `row_${i}` });
        return;
      }
      if (!p.position || !isSupportedPosition(p.position)) {
        if (displayName(p)) {
          rejected.push({ provider: 'nflverse', reason: 'UNSUPPORTED_POSITION', locator: gsis });
        }
        return;
      }
      if (seen.has(gsis)) {
        rejected.push({ provider: 'nflverse', reason: 'DUPLICATE_PROVIDER_ID', locator: gsis });
        return;
      }
      const record = toRecord(p);
      if (!record) return;
      seen.add(gsis);
      records.push(record);
    });

    records.sort((a, b) => a.providerPlayerId.localeCompare(b.providerPlayerId));
    rejected.sort((a, b) => a.locator.localeCompare(b.locator));
    return { provider: 'nflverse', records, rejected };
  },
};
