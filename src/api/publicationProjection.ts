// Player-display projection of a published board entry (Phase 10 API widening).
//
// WHY THIS EXISTS
// A publication bundle already carries, per player, two COMPLETE immutable artifacts: the
// normalized inference input and the serialized production envelope. `GET /publication`
// originally projected only their content checksums — enough to verify a board, but not enough
// for any consumer to display one. This module widens that projection to the fields those
// artifacts already published.
//
// WHAT IT IS NOT
// It computes nothing, defaults nothing, and re-runs no valuation. Every field is read
// straight out of an already-persisted artifact; a field an artifact does not carry is
// projected as `null` (or `[]`), never as a placeholder number. In particular, when the
// inference layer published `readiness: NOT_READY` there is no engine output, so `composites`,
// `confidence` and `volatility` are null — the honest published state, not a zero.
//
// It reads the artifacts STRUCTURALLY (plain JSON), never by importing valuation-engine or
// inference types, so the API layer's boundary (no `@/wr-model`, `@/inference`, ...) holds.

/** Composite scores as published by an engine, normalized to one key spelling. */
export interface PublishedCompositesResponse {
  readonly weekly: number | null;
  readonly ros: number | null;
  readonly oneYear: number | null;
  readonly threeYear: number | null;
  readonly dynasty: number | null;
}

/** Everything a display client can honestly learn about one published player. */
export interface PublishedPlayerProjection {
  /** Canonical player name exactly as the ingestion layer normalized it. */
  readonly name: string | null;
  readonly team: string | null;
  readonly age: number | null;
  /** Roster status as published (e.g. "active"). */
  readonly playerStatus: string | null;
  /** The as-of instant the inference ran against. */
  readonly asOf: string | null;
  /** Envelope top-level status, e.g. "OK" / "PARTIAL" / "UNAVAILABLE". */
  readonly outputStatus: string | null;
  /** "READY" | "NOT_READY" | "ENGINE_UNAVAILABLE" as published. */
  readonly readiness: string | null;
  /** How many engine inputs were missing (0 when ready). */
  readonly readinessMissingCount: number | null;
  readonly honestyState: string | null;
  readonly engineInvoked: boolean;
  readonly publicConfidenceLabel: string | null;
  readonly confidenceScore: number | null;
  readonly confidenceLabel: string | null;
  readonly volatilityScore: number | null;
  readonly volatilityLabel: string | null;
  /** Null whenever no engine ran — never a zeroed placeholder. */
  readonly composites: PublishedCompositesResponse | null;
  readonly limitations: readonly string[];
}

// ---- structural readers (defensive; unknown shape → null, never a throw) ----

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJson(serialized: string | undefined): Record<string, unknown> | null {
  if (typeof serialized !== 'string' || serialized === '') return null;
  try {
    return asRecord(JSON.parse(serialized));
  } catch {
    return null;
  }
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Pipeline `CanonicalPlayer` fields are provenance-wrapped: `{ present: true, value }` when
 * supplied and `{ present: false, reason }` when not. Absent stays absent.
 */
function provenanced(field: unknown): unknown {
  const rec = asRecord(field);
  if (!rec) return undefined;
  return rec.present === true ? rec.value : undefined;
}

/** Engines spell composites differently (WR/RB/TE upper-case, QB lower-case). Read both. */
function readComposites(engineOutput: Record<string, unknown> | null): PublishedCompositesResponse | null {
  const c = engineOutput ? asRecord(engineOutput.composites) : null;
  if (!c) return null;
  const pick = (upper: string, lower: string): number | null => num(c[upper]) ?? num(c[lower]);
  return {
    weekly: pick('WEEKLY', 'weekly'),
    ros: pick('ROS', 'ros'),
    oneYear: pick('ONE_YEAR', 'one_year'),
    threeYear: pick('THREE_YEAR', 'three_year'),
    dynasty: pick('DYNASTY', 'dynasty'),
  };
}

/** WR/RB/TE publish `player_name`/`team` at the root; QB nests them under `player`. */
function readEngineIdentity(engineOutput: Record<string, unknown> | null): { name: string | null; team: string | null } {
  if (!engineOutput) return { name: null, team: null };
  const nested = asRecord(engineOutput.player);
  return {
    name: str(engineOutput.player_name) ?? str(nested?.player_name),
    team: str(engineOutput.team) ?? str(nested?.team),
  };
}

/**
 * Project one published board entry's two artifacts into display fields.
 *
 * `normalizedInputSerialized` is the identity source (it always exists for a published entry);
 * `outputSerialized` adds the valuation fields, but only when an engine actually ran.
 */
export function projectPublishedPlayer(
  normalizedInputSerialized: string | undefined,
  outputSerialized: string | undefined,
): PublishedPlayerProjection {
  const input = parseJson(normalizedInputSerialized);
  const envelope = parseJson(outputSerialized);
  const canonicalPlayer = input ? asRecord(input.player) : null;
  const engineOutput = envelope ? asRecord(envelope.engine_output) : null;
  const engineIdentity = readEngineIdentity(engineOutput);
  const confidence = engineOutput ? asRecord(engineOutput.confidence) : null;
  const volatility = engineOutput ? asRecord(engineOutput.volatility) : null;
  const readinessMissing = envelope ? envelope.readiness_missing : undefined;

  return {
    // Identity prefers the engine's own published spelling and falls back to the canonical
    // ingestion record, which every published entry carries.
    name: engineIdentity.name ?? str(provenanced(canonicalPlayer?.full_name)),
    team: engineIdentity.team ?? str(provenanced(canonicalPlayer?.team)),
    age: num(provenanced(canonicalPlayer?.age)),
    playerStatus: str(provenanced(canonicalPlayer?.status)),
    asOf: str(envelope?.as_of) ?? str(input?.asOf),
    outputStatus: str(envelope?.status),
    readiness: str(envelope?.readiness),
    readinessMissingCount: Array.isArray(readinessMissing) ? readinessMissing.length : null,
    honestyState: str(envelope?.honesty_state),
    engineInvoked: envelope?.engine_invoked === true,
    publicConfidenceLabel: str(envelope?.public_confidence_label),
    confidenceScore: num(confidence?.score),
    confidenceLabel: str(confidence?.label),
    volatilityScore: num(volatility?.score),
    volatilityLabel: str(volatility?.label),
    composites: readComposites(engineOutput),
    limitations: strings(envelope?.limitations),
  };
}
