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

  // WHICH MODEL'S NUMBERS GET PUBLISHED IS DECIDED BY THE TIER, not by which output happens to
  // be present. For QB, RB and TE the two readings agree — a frozen engine output exists exactly
  // when the tier is FULL. WR is the exception: its engine can pass readiness on a capped route
  // ESTIMATE, so a WR stood down to ACCESSIBLE carries BOTH a frozen engine output (retained for
  // diagnostics and for the day premium evidence arrives) and an accessible one. Reading by
  // presence there would publish the premium engine's numbers under an ACCESSIBLE badge, which
  // is the exact mislabelling the tier exists to prevent.
  const useAccessible = tier === 'ACCESSIBLE' && accessible !== null;

  // AN INSUFFICIENT PLAYER PUBLISHES NO VALUE. The tier says no model could value him honestly,
  // so there is no model to read numbers from. This became reachable when WR gained an
  // accessible path: three receivers who played but were never targeted are INSUFFICIENT to the
  // receiving model, while the frozen engine still produced a number for them from its league
  // constants — and one of those numbers was a dynasty composite of 56.6, which would have
  // ranked a never-targeted receiver above real starters under an INSUFFICIENT badge.
  // Keyed on the EXPLICIT tier string, not on `tier`: `readTier` defaults an absent tier to
  // INSUFFICIENT (the safe direction for a badge), and an envelope written before the tier field
  // existed carries none. Nulling those would blank an older board rather than close a leak.
  const publishedComposites =
    str(envelope?.model_tier) === 'INSUFFICIENT'
      ? null
      : useAccessible
        ? accessibleComposites ?? fullComposites
        : fullComposites ?? accessibleComposites;

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
    // Score and label MUST come from the same source, because the board renders them in one
    // cell ("HIGH 82"). So both prefer the frozen engine's own confidence when an engine ran,
    // and fall back to the accessible model's (capped) score when one did not — there is no
    // frozen engine output on the accessible tier. Reading the score from
    // `published_confidence_score` first would silently re-point every FULL-tier player at the
    // AIL's public confidence, which is a different quantity from the engine's confidence and
    // would leave the label describing one number while the score showed another.
    confidenceScore: useAccessible
      ? num(accessibleConfidence?.score) ?? num(envelope?.published_confidence_score)
      : num(confidence?.score) ?? num(envelope?.published_confidence_score) ?? num(accessibleConfidence?.score),
    confidenceLabel: useAccessible
      ? str(accessibleConfidence?.label) ?? str(envelope?.public_confidence_label)
      : str(confidence?.label) ?? str(accessibleConfidence?.label) ?? str(envelope?.public_confidence_label),
    // Volatility is a frozen-engine output and describes the FULL model's input set, so it is
    // withheld on the accessible tier rather than borrowed from a model that did not value him.
    volatilityScore: useAccessible ? null : num(volatility?.score),
    volatilityLabel: useAccessible ? null : str(volatility?.label),
    composites: publishedComposites,
    limitations: strings(envelope?.limitations),
    modelTier: tier,
    modelVersion: str(accessible?.modelVersion) ?? str(envelope?.model_version),
    positionValue: num(accessible?.positionValue),
    // Ranking is a board-level ordering, so it is attached by the board projection rather
    // than read from a per-player artifact (which cannot know the cohort).
    positionalRank: null,
    role: str(accessible?.role),
    explanation: str(accessible?.explanation),
    positiveFactors: strings(accessible?.positiveFactors),
    negativeFactors: strings(accessible?.negativeFactors),
    materialMissingInputs: strings(accessible?.materialMissingInputs),
    insufficientReason: str(insufficient?.reason) ?? str(envelope?.tier_not_attempted_reason),
    provenance: readProvenance(accessible),
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
