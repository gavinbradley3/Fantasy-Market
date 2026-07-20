// Sleeper provider adapter. Sleeper is the audited PRIMARY source for player
// metadata and identity (DESIGN §14.3): names, teams, positions, physical
// facts, availability, and a rich set of cross-provider ids. It does NOT supply
// draft capital or usage stats — those come from nflverse and future stages.

import {
  isSupportedPosition,
  type CanonicalStatus,
} from '@/pipeline/types';
import type {
  AdapterResult,
  ProviderAdapter,
  ProviderRecord,
  RejectedEntry,
} from '@/pipeline/providers/types';
import {
  sleeperPlayerSchema,
  type SleeperPlayerRaw,
} from '@/pipeline/providers/sleeper/schema';

function optId(v: string | number | null | undefined): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

// Sleeper height is usually inches as a string ("72"); occasionally feet-inches
// ("6'2"). Parse both; anything else is dropped rather than guessed.
function parseHeight(v: string | number | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const feetInches = v.match(/^(\d+)'\s*(\d+)/);
  if (feetInches) return Number(feetInches[1]) * 12 + Number(feetInches[2]);
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseWeight(v: string | number | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === 'number' ? v : Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function mapStatus(p: SleeperPlayerRaw): {
  status: CanonicalStatus;
  injuryDesignation?: string;
} {
  if (p.injury_status) return { status: 'injured', injuryDesignation: p.injury_status };
  const s = (p.status ?? '').toLowerCase();
  if (s.includes('sus')) return { status: 'suspended' };
  if (p.active === false || s.includes('inactive')) return { status: 'inactive' };
  if (s.includes('injured') || s.includes('pup') || s.includes('ir')) {
    return { status: 'injured', injuryDesignation: p.status ?? undefined };
  }
  return { status: 'active' };
}

function displayName(p: SleeperPlayerRaw): string | undefined {
  const composed = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return p.full_name ?? (composed.length > 0 ? composed : undefined);
}

function toRecord(p: SleeperPlayerRaw): ProviderRecord | null {
  if (!p.position || !isSupportedPosition(p.position)) return null; // signal caller
  const { status, injuryDesignation } = mapStatus(p);
  const name = displayName(p);
  const rec: ProviderRecord = {
    provider: 'sleeper',
    providerPlayerId: p.player_id,
    crossIds: {
      sleeper: p.player_id,
      ...(optId(p.gsis_id) ? { gsis: optId(p.gsis_id) } : {}),
      ...(optId(p.espn_id) ? { espn: optId(p.espn_id) } : {}),
      ...(optId(p.yahoo_id) ? { yahoo: optId(p.yahoo_id) } : {}),
      ...(optId(p.sportradar_id) ? { sportradar: optId(p.sportradar_id) } : {}),
    },
    position: p.position,
    ...(name ? { fullName: name } : {}),
    ...(p.team ? { team: p.team } : {}),
    ...(typeof p.age === 'number' ? { age: p.age } : {}),
    ...(p.birth_date ? { birthDate: p.birth_date } : {}),
    ...(typeof p.years_exp === 'number' ? { nflSeasonsCompleted: p.years_exp } : {}),
    ...(parseHeight(p.height) !== undefined ? { heightInches: parseHeight(p.height) } : {}),
    ...(parseWeight(p.weight) !== undefined ? { weightPounds: parseWeight(p.weight) } : {}),
    ...(typeof p.number === 'number' ? { jerseyNumber: p.number } : {}),
    status,
    ...(injuryDesignation ? { injuryDesignation } : {}),
  };
  return rec;
}

export const sleeperAdapter: ProviderAdapter = {
  provider: 'sleeper',
  parse(raw: unknown): AdapterResult {
    const rejected: RejectedEntry[] = [];
    const records: ProviderRecord[] = [];
    const seen = new Set<string>();

    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      // A whole-payload shape failure is fatal for THIS provider, reported as a
      // single rejection rather than thrown, so the pipeline can continue with
      // other providers.
      return {
        provider: 'sleeper',
        records: [],
        rejected: [{ provider: 'sleeper', reason: 'MALFORMED', locator: '<payload>' }],
      };
    }

    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const parsed = sleeperPlayerSchema.safeParse(value);
      if (!parsed.success) {
        rejected.push({ provider: 'sleeper', reason: 'MALFORMED', locator: key });
        continue;
      }
      const p = parsed.data;
      if (!p.position || !isSupportedPosition(p.position)) {
        // Only report unsupported positions for entries that look like players
        // (have a name); team-defense/kicker rows are noise, not rejections.
        if (displayName(p)) {
          rejected.push({ provider: 'sleeper', reason: 'UNSUPPORTED_POSITION', locator: p.player_id });
        }
        continue;
      }
      if (seen.has(p.player_id)) {
        rejected.push({ provider: 'sleeper', reason: 'DUPLICATE_PROVIDER_ID', locator: p.player_id });
        continue;
      }
      const record = toRecord(p);
      if (!record) continue;
      seen.add(p.player_id);
      records.push(record);
    }

    // Deterministic order regardless of object-key iteration quirks.
    records.sort((a, b) => a.providerPlayerId.localeCompare(b.providerPlayerId));
    rejected.sort((a, b) => a.locator.localeCompare(b.locator));
    return { provider: 'sleeper', records, rejected };
  },
};
