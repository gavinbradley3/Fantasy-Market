// DynastyProcess market adapter (pure — no IO).
//
// SOURCE. github.com/dynastyprocess/data publishes `files/values-players.csv`, a dynasty
// value table carrying BOTH formats explicitly (`value_1qb` / `value_2qb`, where 2QB is
// Superflex) plus a consensus rank per format and its own `scrape_date`. It is GPL-3.0 and
// the repository states it exists "for the purpose of supporting apps and developers".
//
// IDENTITY. The values file keys players by FantasyPros id (`fp_id`) only. The same repo
// publishes `files/db_playerids.csv`, a crosswalk carrying `fantasypros_id` alongside
// `gsis_id` — the namespace PlayerTicker's canonical ids are already minted from. So the join
// is fp_id → gsis_id → the EXISTING IdentityResolver, and no parallel identity system is
// introduced.
//
// Why the join must go through an id and never a name: the crosswalk contains two players
// called "Justin Jefferson" (the Vikings WR, gsis 00-0036322, and a Browns LB, gsis
// 00-0041075). Matching on name picks whichever row sorts first. Matching on fp_id does not.

import { IdentityResolver } from '@/ingestion/identity';
import type { MarketBatch, MarketFormat, MarketRejection, MarketSnapshot } from './types';

export const DYNASTYPROCESS_SOURCE = 'dynastyprocess';

/** Raw columns this adapter reads from `values-players.csv`. */
export interface DynastyProcessValueRow {
  readonly player?: string;
  readonly pos?: string;
  readonly team?: string;
  readonly value_1qb?: string;
  readonly value_2qb?: string;
  readonly ecr_1qb?: string;
  readonly ecr_2qb?: string;
  readonly scrape_date?: string;
  readonly fp_id?: string;
}

/** Raw columns this adapter reads from `db_playerids.csv`. */
export interface DynastyProcessIdRow {
  readonly fantasypros_id?: string;
  readonly gsis_id?: string;
  readonly name?: string;
  readonly position?: string;
  readonly team?: string;
}

export interface AdaptOptions {
  readonly format: MarketFormat;
  /** Capture instant, injected — never Date.now() inside the adapter. */
  readonly ingestedAt: string;
  /** Reused across batches so a canonical id stays stable run to run. */
  readonly resolver?: IdentityResolver;
  /** Age beyond which a snapshot is reported `stale`. Default 8 days (source is weekly). */
  readonly staleAfterMs?: number;
}

/** The source refreshes weekly, so a fortnight-old file is meaningfully behind. */
const DEFAULT_STALE_AFTER_MS = 8 * 24 * 60 * 60 * 1000;

function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const t = raw.trim();
  if (t === '' || t === 'NA' || t === 'NULL') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** `scrape_date` is a bare calendar day; anchor it at UTC midnight. */
function parseScrapeDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const ms = Date.parse(`${t}T00:00:00.000Z`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** nflverse/PlayerTicker positions this market lens covers. */
const SUPPORTED_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

/** Build fantasypros_id → gsis_id. A row missing either side cannot bridge and is skipped. */
export function buildFpToGsis(rows: readonly DynastyProcessIdRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const fp = row.fantasypros_id?.trim();
    const gsis = row.gsis_id?.trim();
    if (!fp || !gsis) continue;
    // First writer wins: the crosswalk is one row per player, and a later duplicate would be
    // a source defect rather than a reason to reassign an already-bridged id.
    if (!map.has(fp)) map.set(fp, gsis);
  }
  return map;
}

/**
 * Adapt one DynastyProcess values payload into provider-neutral snapshots.
 *
 * Ranks are assigned here by ordering on value, and marked `derived` — the source publishes a
 * fractional consensus rank (an average of ballots), which is retained separately as
 * `sourceConsensusRank` rather than rounded into an integer rank it never claimed to be.
 */
export function adaptDynastyProcess(
  valueRows: readonly DynastyProcessValueRow[],
  idRows: readonly DynastyProcessIdRow[],
  options: AdaptOptions,
): MarketBatch {
  const resolver = options.resolver ?? new IdentityResolver();
  const staleAfter = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const fpToGsis = buildFpToGsis(idRows);
  const valueKey = options.format === 'dynasty_superflex' ? 'value_2qb' : 'value_1qb';
  const ecrKey = options.format === 'dynasty_superflex' ? 'ecr_2qb' : 'ecr_1qb';

  const rejections: MarketRejection[] = [];
  const seen = new Set<string>();

  // Pass 1 — resolve identity and validate values.
  interface Pending {
    readonly snapshot: Omit<MarketSnapshot, 'overallRank' | 'positionRank'>;
    readonly position: string;
  }
  const pending: Pending[] = [];
  let latestSourceStamp: string | null = null;

  for (const row of valueRows) {
    const name = row.player?.trim() ?? null;
    const fp = row.fp_id?.trim() ?? null;

    if (!fp) {
      rejections.push({ reason: 'NO_SOURCE_ID', detail: 'row carries no fp_id', sourcePlayerId: null, sourceName: name });
      continue;
    }

    const gsis = fpToGsis.get(fp);
    if (!gsis) {
      rejections.push({
        reason: 'UNRESOLVED_IDENTITY',
        detail: `fp_id ${fp} has no gsis_id in the crosswalk`,
        sourcePlayerId: fp,
        sourceName: name,
      });
      continue;
    }

    const position = row.pos?.trim().toUpperCase() ?? '';
    if (!SUPPORTED_POSITIONS.has(position)) {
      rejections.push({
        reason: 'POSITION_MISMATCH',
        detail: `unsupported position "${position}"`,
        sourcePlayerId: fp,
        sourceName: name,
      });
      continue;
    }

    const value = parseNumber(row[valueKey]);
    if (value !== null && value < 0) {
      rejections.push({
        reason: 'INVALID_VALUE',
        detail: `negative ${valueKey}: ${row[valueKey]}`,
        sourcePlayerId: fp,
        sourceName: name,
      });
      continue;
    }

    const resolution = resolver.resolve({
      providerIds: { gsis },
      nameNormalized: (name ?? '').toLowerCase(),
      position: position as 'QB' | 'RB' | 'WR' | 'TE',
      provider: 'nflverse',
    });
    if (!resolution.canonicalId) {
      rejections.push({
        reason: 'UNRESOLVED_IDENTITY',
        detail: `resolver returned no canonical id for gsis ${gsis}`,
        sourcePlayerId: fp,
        sourceName: name,
      });
      continue;
    }

    // One player may appear once per batch. A repeat is a source defect, not a second value.
    const dupKey = `${resolution.canonicalId}|${options.format}`;
    if (seen.has(dupKey)) {
      rejections.push({
        reason: 'DUPLICATE',
        detail: `${resolution.canonicalId} already present in this batch`,
        sourcePlayerId: fp,
        sourceName: name,
      });
      continue;
    }
    seen.add(dupKey);

    const sourceTimestamp = parseScrapeDate(row.scrape_date) ?? options.ingestedAt;
    if (latestSourceStamp === null || sourceTimestamp > latestSourceStamp) {
      latestSourceStamp = sourceTimestamp;
    }

    const ageMs = Date.parse(options.ingestedAt) - Date.parse(sourceTimestamp);
    const freshness: MarketSnapshot['freshness'] = !Number.isFinite(ageMs)
      ? 'unknown'
      : ageMs > staleAfter
        ? 'stale'
        : 'fresh';

    pending.push({
      position,
      snapshot: {
        canonicalPlayerId: resolution.canonicalId,
        source: DYNASTYPROCESS_SOURCE,
        format: options.format,
        value,
        sourceConsensusRank: parseNumber(row[ecrKey]),
        sourcePlayerId: fp,
        sourcePosition: position,
        sourceTeam: row.team?.trim() || null,
        sourceTimestamp,
        ingestedAt: options.ingestedAt,
        freshness,
        provenance: 'external',
      },
    });
  }

  // Pass 2 — derive integer ranks by ordering on value. A player with no value is ranked
  // nowhere rather than last, because "unranked" and "worst" are different claims.
  const valued = pending
    .filter((p) => p.snapshot.value !== null)
    .sort((a, b) => (b.snapshot.value ?? 0) - (a.snapshot.value ?? 0) || a.snapshot.canonicalPlayerId.localeCompare(b.snapshot.canonicalPlayerId));

  const overallRankById = new Map<string, number>();
  valued.forEach((p, i) => overallRankById.set(p.snapshot.canonicalPlayerId, i + 1));

  const positionRankById = new Map<string, number>();
  const perPosition = new Map<string, number>();
  for (const p of valued) {
    const next = (perPosition.get(p.position) ?? 0) + 1;
    perPosition.set(p.position, next);
    positionRankById.set(p.snapshot.canonicalPlayerId, next);
  }

  const snapshots: MarketSnapshot[] = pending.map((p) => ({
    ...p.snapshot,
    overallRank: overallRankById.get(p.snapshot.canonicalPlayerId) ?? null,
    positionRank: positionRankById.get(p.snapshot.canonicalPlayerId) ?? null,
  }));

  return {
    source: DYNASTYPROCESS_SOURCE,
    format: options.format,
    sourceTimestamp: latestSourceStamp ?? options.ingestedAt,
    ingestedAt: options.ingestedAt,
    snapshots,
    rejections,
  };
}
