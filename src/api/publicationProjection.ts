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

/**
 * Which model produced a published valuation, as the frontend sees it.
 *
 *  FULL         — the frozen engine ran on its complete declared input set.
 *  ACCESSIBLE   — the accessible-data model ran on the acquirable input set. Fewer inputs, a
 *                 lower confidence ceiling, and a different model — not the full model with
 *                 defaults filled in.
 *  INSUFFICIENT — no value could be published for this player.
 */
export type PublishedModelTier = 'FULL' | 'ACCESSIBLE' | 'INSUFFICIENT';

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
  /** Null whenever no model produced a valuation — never a zeroed placeholder. */
  readonly composites: PublishedCompositesResponse | null;
  readonly limitations: readonly string[];

  // ---- model tier (accessible-data redesign) ----
  /**
   * Which model produced this valuation. The frontend MUST branch on this rather than
   * inferring a tier from which fields happen to be populated.
   */
  readonly modelTier: PublishedModelTier;
  /** Versioned id of the model that produced the value ("rb-accessible-1.0", "qb-mvp-1.0"). */
  readonly modelVersion: string | null;
  /** Headline 0–100 position value used for ranking; null when unvalued. */
  readonly positionValue: number | null;
  /** Rank within the player's position on this board (1 = best). Null when unvalued. */
  readonly positionalRank: number | null;
  /** Usage-derived role label, e.g. "Three-down lead back". Accessible tier only. */
  readonly role: string | null;
  /** One-sentence plain-language summary. Never a raw registry key. */
  readonly explanation: string | null;
  readonly positiveFactors: readonly string[];
  readonly negativeFactors: readonly string[];
  /** Product-language names of inputs a full valuation would have used and this one did not. */
  readonly materialMissingInputs: readonly string[];
  /**
   * How many of the engine's declared inputs were SUBSTITUTED rather than supplied — derived
   * from the player's other numbers, or replaced by a league prior or a class default.
   *
   * A COVERAGE fact, and the one the QB tier had nowhere honest to put. The full model runs for
   * every quarterback, so the tier badge reads "Full" — but on the live board every one of the
   * 81 ran with 16 substituted inputs, because no free feed exists for protection context,
   * offensive environment, explosive pass rate, CPOE, dropback share or the expected per-game
   * splits. That was being reported as a 20-point confidence deduction on each player, which
   * described the pipeline rather than the player. It is reported here instead.
   *
   * Null when the engine published no fallback log (the accessible tier, which states its own
   * gaps through `materialMissingInputs`, and any player no model valued).
   */
  readonly inputsSubstituted: number | null;
  /** Product-facing reason no value was published, when the tier is INSUFFICIENT. */
  readonly insufficientReason: string | null;
  readonly provenance: PublishedProvenanceResponse | null;
}

/** Provenance summary for one accessible-tier valuation. */
export interface PublishedProvenanceResponse {
  readonly gamesObserved: number | null;
  readonly seasonsObserved: number | null;
  readonly teamSharesDerived: boolean;
  readonly observedFields: readonly string[];
  readonly derivedFields: readonly string[];
  readonly unavailableFields: readonly string[];
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

function bool(value: unknown): boolean {
  return value === true;
}

function readTier(envelope: Record<string, unknown> | null): PublishedModelTier {
  const t = str(envelope?.model_tier);
  return t === 'FULL' || t === 'ACCESSIBLE' || t === 'INSUFFICIENT' ? t : 'INSUFFICIENT';
}

/** Accessible-tier composites use lower-camel keys; the frozen engines use upper-snake. */
function readAccessibleComposites(accessible: Record<string, unknown> | null): PublishedCompositesResponse | null {
  const c = accessible ? asRecord(accessible.composites) : null;
  if (!c) return null;
  return {
    weekly: num(c.weekly),
    ros: num(c.ros),
    oneYear: num(c.oneYear),
    threeYear: num(c.threeYear),
    dynasty: num(c.dynasty),
  };
}

function readProvenance(accessible: Record<string, unknown> | null): PublishedProvenanceResponse | null {
  const p = accessible ? asRecord(accessible.provenance) : null;
  if (!p) return null;
  return {
    gamesObserved: num(p.gamesObserved),
    seasonsObserved: num(p.seasonsObserved),
    teamSharesDerived: bool(p.teamSharesDerived),
    observedFields: strings(p.observedFields),
    derivedFields: strings(p.derivedFields),
    unavailableFields: strings(p.unavailableFields),
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
  const tier = readTier(envelope);
  const accessible = envelope ? asRecord(envelope.accessible_model) : null;
  const insufficient = envelope ? asRecord(envelope.accessible_insufficient) : null;
  const accessibleConfidence = accessible ? asRecord(accessible.confidence) : null;
  const fullComposites = readComposites(engineOutput);
  const accessibleComposites = readAccessibleComposites(accessible);

  // Explicit tier ownership is authoritative. Rejected outputs can coexist in the envelope
  // for private diagnosis, but no field may fall through from one model into another.
  // Truly pre-tier envelopes retain their old composite compatibility path; a present but
  // unknown tier is not treated as legacy.
  const explicitTier = str(envelope?.model_tier);
  const legacyTier = explicitTier === null;
  const useAccessible = tier === 'ACCESSIBLE'
    || (legacyTier && fullComposites === null && accessibleComposites !== null);
  const selectedComposites = useAccessible
    ? accessibleComposites
    : tier === 'FULL' || legacyTier ? fullComposites : null;
  const hasValuation = str(envelope?.status) !== 'UNAVAILABLE' && selectedComposites !== null
    && Object.values(selectedComposites).some((value) => value !== null);
  const publishedComposites = hasValuation ? selectedComposites : null;
  const publishAccessible = hasValuation && useAccessible;
  const publishFull = hasValuation && !useAccessible;

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
    // Missing artifacts make no honesty assertion. When a rejected output does assert one,
    // prevent a retained COMPLETE/LIMITED diagnostic from describing an absent valuation.
    honestyState: hasValuation || str(envelope?.honesty_state) === null
      ? str(envelope?.honesty_state) : 'UNAVAILABLE',
    engineInvoked: envelope?.engine_invoked === true,
    publicConfidenceLabel: !hasValuation ? null
      : useAccessible ? str(accessibleConfidence?.label) : str(envelope?.public_confidence_label),
    // Accepted source only; neither a rejected full-engine confidence nor its fallback log
    // describes the accessible valuation. Unvalued players have no confidence to headline.
    confidenceScore: !hasValuation
      ? null
      : useAccessible
        ? num(accessibleConfidence?.score)
        : num(confidence?.score) ?? num(envelope?.published_confidence_score),
    confidenceLabel: !hasValuation
      ? null
      : useAccessible
        ? str(accessibleConfidence?.label)
        : str(confidence?.label) ?? str(envelope?.public_confidence_label),
    volatilityScore: publishFull ? num(volatility?.score) : null,
    volatilityLabel: publishFull ? str(volatility?.label) : null,
    composites: publishedComposites,
    limitations: strings(envelope?.limitations),
    modelTier: tier,
    modelVersion: !hasValuation ? null : useAccessible ? str(accessible?.modelVersion) : str(envelope?.model_version),
    positionValue: publishAccessible ? num(accessible?.positionValue) : null,
    // Ranking is a board-level ordering, so it is attached by the board projection rather
    // than read from a per-player artifact (which cannot know the cohort).
    positionalRank: null,
    role: publishAccessible ? str(accessible?.role) : null,
    explanation: publishAccessible ? str(accessible?.explanation) : null,
    positiveFactors: publishAccessible ? strings(accessible?.positiveFactors) : [],
    negativeFactors: publishAccessible ? strings(accessible?.negativeFactors) : [],
    materialMissingInputs: publishAccessible ? strings(accessible?.materialMissingInputs) : [],
    inputsSubstituted: publishFull && Array.isArray(engineOutput?.fallback_log) ? engineOutput.fallback_log.length : null,
    insufficientReason: hasValuation ? null : str(insufficient?.reason) ?? str(envelope?.tier_not_attempted_reason),
    provenance: publishAccessible ? readProvenance(accessible) : null,
  };
}

/**
 * Attach positional ranks to a projected board.
 *
 * Rank is assigned within a position over the entries that actually carry a position value,
 * best first. Ties break on canonical id so the ordering is total and replay-stable rather
 * than dependent on input order. Unvalued entries keep `positionalRank: null` — they are not
 * ranked last, because "no value" is not "worst value".
 */
export function withPositionalRanks<T extends PublishedPlayerProjection & { position: string; canonicalId: string }>(
  entries: readonly T[],
): T[] {
  const byPosition = new Map<string, T[]>();
  for (const e of entries) {
    if (e.positionValue === null) continue;
    const list = byPosition.get(e.position);
    if (list) list.push(e);
    else byPosition.set(e.position, [e]);
  }
  const ranks = new Map<string, number>();
  for (const list of byPosition.values()) {
    const ordered = [...list].sort((a, b) => {
      const d = (b.positionValue ?? 0) - (a.positionValue ?? 0);
      return d !== 0 ? d : a.canonicalId.localeCompare(b.canonicalId);
    });
    ordered.forEach((e, i) => ranks.set(e.canonicalId, i + 1));
  }
  return entries.map((e) => {
    const rank = ranks.get(e.canonicalId);
    return rank === undefined ? e : { ...e, positionalRank: rank };
  });
}
