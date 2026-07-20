// Normalization: merge a resolved cluster's provider records into ONE canonical
// player, applying the audit's field ownership / precedence and recording
// provenance for every value. Missing values become explicit MissingFields —
// never 0/""/false/"Unknown".
//
// Field ownership (DESIGN §14.3):
//   • Sleeper owns live metadata: name, team, availability, physicals, age,
//     experience, jersey.  nflverse is the fallback.
//   • nflverse owns draft capital: draft year / round / pick and rookie year.
//     Sleeper does not supply these, so there is no fallback.
// When two providers disagree on a value, the higher-precedence value wins and
// the disagreement is reported as a metadata conflict (never silently dropped).

import { missing, notProvided, present } from '@/pipeline/provenance';
import type { PlayerCluster } from '@/pipeline/identity';
import type { ProviderRecord } from '@/pipeline/providers/types';
import type {
  CanonicalPlayer,
  CanonicalStatus,
  FieldState,
  ProviderId,
} from '@/pipeline/types';

const METADATA_PRECEDENCE: readonly ProviderId[] = ['sleeper', 'nflverse'];
const DRAFT_PRECEDENCE: readonly ProviderId[] = ['nflverse', 'sleeper'];

export interface MetadataConflict {
  readonly canonicalId: string;
  readonly field: string;
  readonly values: readonly { provider: ProviderId; value: string }[];
}

export interface NormalizeConfig {
  /** Deterministic generation stamp written to canonical provenance. */
  readonly generatedAt: string;
  /** Per-provider snapshot retrieval timestamps (source provenance). */
  readonly sourceTimestamps: Readonly<Record<ProviderId, string>>;
  /** "As of" date used to derive age from birth_date; ISO date. */
  readonly asOf: string;
}

export interface NormalizedPlayer {
  readonly player: CanonicalPlayer;
  readonly conflicts: readonly MetadataConflict[];
}

type Extractor<T> = (r: ProviderRecord) => T | undefined;

function recordByProvider(cluster: PlayerCluster, provider: ProviderId): ProviderRecord | undefined {
  return cluster.records.find((r) => r.provider === provider);
}

// Resolve one field by precedence, emitting a conflict when a lower-precedence
// provider disagrees with the chosen value.
function resolveField<T>(
  cluster: PlayerCluster,
  extract: Extractor<T>,
  precedence: readonly ProviderId[],
  cfg: NormalizeConfig,
  fieldName: string,
  conflicts: MetadataConflict[],
): FieldState<T> {
  const contributions: { provider: ProviderId; value: T }[] = [];
  for (const provider of precedence) {
    const rec = recordByProvider(cluster, provider);
    if (!rec) continue;
    const value = extract(rec);
    if (value !== undefined) contributions.push({ provider, value });
  }
  if (contributions.length === 0) return notProvided();

  const chosen = contributions[0];
  const disagreeing = contributions.filter((c) => c.value !== chosen.value);
  if (disagreeing.length > 0) {
    conflicts.push({
      canonicalId: cluster.identity.canonical_id,
      field: fieldName,
      values: contributions.map((c) => ({ provider: c.provider, value: String(c.value) })),
    });
  }
  const isFallback = chosen.provider !== precedence[0];
  return present(
    chosen.value,
    chosen.provider,
    cfg.sourceTimestamps[chosen.provider],
    isFallback ? 'FALLBACK' : 'DIRECT',
  );
}

// Age: prefer a directly-supplied age; otherwise derive from birth_date at the
// configured "as of" date (whole years). Derivation is marked DERIVED.
function resolveAge(
  cluster: PlayerCluster,
  cfg: NormalizeConfig,
  birthDate: FieldState<string>,
): FieldState<number> {
  const conflicts: MetadataConflict[] = [];
  const direct = resolveField(
    cluster,
    (r) => r.age,
    METADATA_PRECEDENCE,
    cfg,
    'age',
    conflicts,
  );
  if (direct.present) return direct;
  if (birthDate.present) {
    const born = Date.parse(birthDate.value);
    const asOf = Date.parse(cfg.asOf);
    if (!Number.isNaN(born) && !Number.isNaN(asOf) && asOf >= born) {
      const years = Math.floor((asOf - born) / (365.2425 * 24 * 3600 * 1000));
      return present(years, birthDate.provider, birthDate.sourceTimestamp, 'DERIVED');
    }
  }
  return notProvided();
}

export function normalizeCluster(cluster: PlayerCluster, cfg: NormalizeConfig): NormalizedPlayer {
  const conflicts: MetadataConflict[] = [];
  const meta = <T>(extract: Extractor<T>, field: string) =>
    resolveField(cluster, extract, METADATA_PRECEDENCE, cfg, field, conflicts);
  const draft = <T>(extract: Extractor<T>, field: string) =>
    resolveField(cluster, extract, DRAFT_PRECEDENCE, cfg, field, conflicts);

  const full_name = meta((r) => r.fullName, 'full_name');
  const team = meta((r) => r.team, 'team');
  const birth_date = meta((r) => r.birthDate, 'birth_date');
  const age = resolveAge(cluster, cfg, birth_date);
  const nfl_seasons_completed = meta((r) => r.nflSeasonsCompleted, 'nfl_seasons_completed');
  const rookie_year = draft((r) => r.rookieYear, 'rookie_year');
  const draft_year = draft((r) => r.draftYear, 'draft_year');
  const draft_round = draft((r) => r.draftRound, 'draft_round');
  const draft_pick = draft((r) => r.draftPick, 'draft_pick');
  const height_inches = meta((r) => r.heightInches, 'height_inches');
  const weight_pounds = meta((r) => r.weightPounds, 'weight_pounds');
  const jersey_number = meta((r) => r.jerseyNumber, 'jersey_number');
  const status = meta<CanonicalStatus>((r) => r.status, 'status');
  const injury_designation = meta((r) => r.injuryDesignation, 'injury_designation');
  // Headshots require a licensed source (DESIGN §15.3); no audited free source
  // supplies one for this milestone.
  const headshot_url: FieldState<string> = missing(
    'UNSUPPORTED_BY_SOURCE',
    'No licensed image source in this milestone (DESIGN §15.3).',
  );

  // Position conflict is meaningful: report it, keep the cluster's position.
  const positions = new Set(cluster.records.map((r) => r.position));
  if (positions.size > 1) {
    conflicts.push({
      canonicalId: cluster.identity.canonical_id,
      field: 'position',
      values: cluster.records.map((r) => ({ provider: r.provider, value: r.position })),
    });
  }
  const position = cluster.records[0].position;

  const sources = [...new Set(cluster.records.map((r) => r.provider))].sort();

  const player: CanonicalPlayer = {
    identity: cluster.identity,
    position,
    full_name,
    team,
    age,
    birth_date,
    nfl_seasons_completed,
    rookie_year,
    draft_year,
    draft_round,
    draft_pick,
    height_inches,
    weight_pounds,
    jersey_number,
    status,
    injury_designation,
    headshot_url,
    provenance: { sources, generated_at: cfg.generatedAt },
  };

  conflicts.sort((a, b) =>
    a.canonicalId === b.canonicalId
      ? a.field.localeCompare(b.field)
      : a.canonicalId.localeCompare(b.canonicalId),
  );
  return { player, conflicts };
}
