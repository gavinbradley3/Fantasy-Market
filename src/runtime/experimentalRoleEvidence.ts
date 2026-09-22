// Experimental-only port of reviewed proposal-1. Never changes model inputs or production inference.
import type { RoleInput, RoleObservation, RoleAttestation, RoleOpportunity, RoleAssessment, RoleDetail, RoleState } from './experimentalRoleReferences';
export const CONTRACT = Object.freeze({
  id: 'playerticker.experimental.role-evidence-opportunities/v1',
  expiry: { QB: 2, RB: 3, WR: 3, TE: 3 },
  recovery: { QB: 1, RB: 2, WR: 2, TE: 2 },
  attestationDays: 7,
});
const ms = (s: string | null | undefined) => typeof s === 'string' ? Date.parse(s) : NaN;
const known = (r: { knownAt: string }, asOf: string) => Number.isFinite(ms(r.knownAt)) && ms(r.knownAt) <= ms(asOf);
const ge = (n: unknown, k: number) => typeof n === 'number' && Number.isFinite(n) && n >= k;
export const CLAIMS: Readonly<Record<RoleInput['position'], readonly string[]>> = {
  QB: ['STARTER'],
  RB: ['Three-down lead back', 'Lead rusher'],
  WR: ['Alpha target earner'],
  TE: ['Primary receiving option'],
};

// Existing volume cutoffs are reused ONLY as sufficient claim corroboration.
// Applying them to individual games is a new, provisional policy choice.
// Shares reconstructed from incomplete player rows, snaps, touches and targets are
// never substituted for one another. A low-use game cannot renew a stronger claim.
export function supportsClaim(position: RoleInput['position'], claim: string, observation?: RoleObservation) {
  if (!observation || !observation.trusted || observation.specialTeamsOnly) return false;
  if (position === 'QB') return claim === 'STARTER' && observation.officialStart === true;
  if (position === 'RB') {
    if (claim === 'Three-down lead back') return ge(observation.carries, 15) && ge(observation.targets, 3);
    return claim === 'Lead rusher' && ge(observation.carries, 15);
  }
  if (position === 'WR') return claim === 'Alpha target earner' && ge(observation.targets, 9);
  if (position === 'TE') return claim === 'Primary receiving option' && ge(observation.targets, 6);
  return false;
}

/**
 * Preconditions are explicit assertions WITH provenance in fixtures, not claims that
 * today's normalized snapshot supplies them. Missing reference coverage fails closed.
 * Intervals are half-open [from, to); verified continuity is not inferred from two rows.
 */
export function assessExperimentalRoleEvidence(input: RoleInput, policy = CONTRACT): RoleAssessment {
  const { asOf, position, claim } = input;
  if (!Number.isFinite(ms(asOf))) throw new Error('fixed valid asOf required');
  const historicalObservations = structuredClone(input.observations.filter((o) =>
    known(o, asOf) && Number.isFinite(ms(o.observedAt)) && ms(o.observedAt) <= ms(asOf)));
  const out = (state: RoleState, detail: RoleDetail = {}): RoleAssessment => ({
    contractId: policy.id, asOf, position, historicalClaim: claim,
    currentRoleEvidence: state,
    currentClaim: state === 'SUPPORTED_OBSERVED' || state === 'SUPPORTED_ATTESTED' ? claim : null,
    availability: availability(input),
    historicalObservations,
    historyRetained: true,
    historyView: 'AS_OF_CLAMPED; complete original input remains immutable',
    // Eligibility is enforced by the experimental boundary; model inputs stay intact.
    downstream: state === 'SUPPORTED_OBSERVED' && detail.numericalRoleContext !== 'REQUIRES_POST_GAP_INPUT_POLICY' ? 'EXISTING_PATH_CANDIDATE'
      : state === 'REFERENCE_INCOMPLETE' ? 'RUN_REFERENCE_INCOMPLETE'
      : 'HOLD_CURRENT_VALUE_ROLE_INPUT_CONTRACT_UNSUPPORTED',
    downstreamExecuted: true,
    productionPublicationAuthorized: false,
    ...detail,
  });
  if (!CLAIMS[position]?.includes(claim)) return out('UNKNOWN_UNSUPPORTED_CLAIM');
  if ((['mandatorySources', 'completion', 'playerObservations', 'membership'] as const).some((key) =>
    input.coverage[key]?.complete !== true || !input.coverage[key]?.provenance)) {
    return out('REFERENCE_INCOMPLETE', { reason: 'mandatory coordinate or semantic reference coverage missing' });
  }
  const memberships = input.memberships.filter((m) => known(m, asOf) && m.trusted && m.provenance);
  const current = memberships.filter((m) => ms(m.from) <= ms(asOf) && (!m.to || ms(asOf) < ms(m.to)));
  if (current.length !== 1) return out('UNKNOWN_MEMBERSHIP', { reason: 'current tenure missing or ambiguous' });
  const tenure = current[0];
  if (tenure.team === null) return out('NO_CURRENT_TEAM_CLAIM', { reason: 'positively attested release/free agency; admission unchanged' });
  const relevant = input.opportunities.filter((g) => g.team === tenure.team && g.seasonType === 'REG');
  if (relevant.some((g) => g.status === 'FINAL'
    && (!Number.isFinite(ms(g.startedAt)) || !Number.isFinite(ms(g.completedAt))
      || ms(g.startedAt) > ms(g.completedAt)))) {
    return out('REFERENCE_INCOMPLETE', { reason: 'final game lacks usable actual start for tenure attribution' });
  }
  const active = relevant.filter((g) => {
    const start = g.status === 'FINAL' ? g.startedAt : g.scheduledAt;
    return ms(start) >= ms(tenure.from) && ms(start) <= ms(asOf);
  });
  if (active.some((g) => !known(g, asOf) || !g.provenance || !g.trusted
    || !['FINAL', 'POSTPONED', 'CANCELLED', 'BYE'].includes(g.status)
    || (g.status === 'FINAL' && (!g.completionProof || !Number.isFinite(ms(g.completedAt)) || ms(g.completedAt) > ms(asOf))))) {
    return out('REFERENCE_INCOMPLETE', { reason: 'past date is not completion proof' });
  }
  const games = active.filter((g) => g.status === 'FINAL').sort((a, b) => ms(a.completedAt) - ms(b.completedAt) || a.id.localeCompare(b.id));
  if (new Set(games.map((g) => g.id)).size !== games.length) return out('REFERENCE_INCOMPLETE', { reason: 'duplicate opportunity identity' });
  const observations = historicalObservations.filter((o) => o.team === tenure.team && o.provenance);
  if (games.some((g) => observations.filter((o) => o.gameId === g.id).length > 1)) {
    return out('REFERENCE_INCOMPLETE', { reason: 'conflicting/duplicate player observations' });
  }
  if (games.some((g) => observations.some((o) => o.gameId === g.id && (!o.trusted || o.roleFieldsComplete !== true
    || (position === 'QB' ? typeof o.officialStart !== 'boolean'
      : position === 'RB' ? o.carries == null || (claim === 'Three-down lead back' && o.targets == null) : o.targets == null))))) {
    return out('UNKNOWN_PLAYER_OBSERVATIONS', { reason: 'player role columns incomplete; no zero imputation' });
  }
  const futureAttestationsExcluded = input.attestations.filter((a) => !known(a, asOf) || ms(a.effectiveAt) > ms(asOf)).map((a) => a.id).sort();
  // Only explicit team-authoritative statements about THIS EXACT claim may adjudicate it.
  // Generic depth rank and medical status cannot assert an alpha/lead workload.
  const attestations = input.attestations.filter((a) => known(a, asOf) && ms(a.effectiveAt) <= ms(asOf)
    && ms(a.effectiveAt) >= ms(tenure.from) && a.team === tenure.team && a.claim === claim
    && a.trusted && a.provenance && a.authority === 'TEAM_OFFICIAL');
  const timeline: ({ at: string; kind: 'game'; value: RoleOpportunity } | { at: string; kind: 'attestation'; value: RoleAttestation })[] = [...games.map((g) => ({ at: g.completedAt!, kind: 'game' as const, value: g })),
    ...attestations.map((a) => ({ at: a.effectiveAt, kind: 'attestation' as const, value: a }))]
    .sort((a, b) => ms(a.at) - ms(b.at) || a.kind.localeCompare(b.kind));
  let observedSupport = false;
  let streak = 0;
  let gap = 0;
  let reason = 'no established same-tenure claim evidence';
  let lastSupportGame: string | null = null;
  let positive: RoleAttestation | null = null;
  let negative = false;
  let conflict = false;
  // An old workload cannot be reopened by a qualitative return/attestation alone.
  // This proposal deliberately defines no new post-gap production window or formula.
  let discontinuity = historicalObservations.some((o) => ms(o.observedAt) < ms(tenure.from));
  for (let i = 0; i < timeline.length;) {
    const at = timeline[i].at;
    const simultaneous: typeof timeline = [];
    while (i < timeline.length && ms(timeline[i].at) === ms(at)) simultaneous.push(timeline[i++]);
    const declarations = simultaneous.filter((x) => x.kind === 'attestation').map((x) => x.value);
    const hasPositive = declarations.some((a) => a.verdict === 'AFFIRM');
    const hasNegative = declarations.some((a) => a.verdict === 'WITHDRAW');
    for (const event of simultaneous.filter((x) => x.kind === 'game')) {
      const game = event.value;
      positive = null; // An attestation expires at the next completed team opportunity.
      const observation = observations.find((o) => o.gameId === game.id);
      const supports = supportsClaim(position, claim, observation);
      if (supports) {
        streak += 1;
        if (observedSupport || streak >= policy.recovery[position]) {
          observedSupport = true; negative = false; conflict = false; gap = 0;
          reason = 'same-tenure claim corroborated'; lastSupportGame = game.id;
        }
      } else {
        streak = 0; gap += 1;
        if (gap >= policy.expiry[position]) {
          discontinuity = true;
          observedSupport = false; reason = 'claim expired after completed opportunities without supporting evidence';
        }
      }
    }
    if (hasNegative || (hasPositive && hasNegative)) {
      discontinuity = true;
      observedSupport = false; streak = 0; positive = null;
      negative = !hasPositive; conflict = hasPositive;
      reason = conflict ? 'simultaneous contradictory authoritative claims' : 'explicit withdrawal of this role';
    } else if (hasPositive) {
      positive = declarations.filter((a) => a.verdict === 'AFFIRM').sort((a, b) => a.id.localeCompare(b.id))[0];
      negative = false; conflict = false; reason = 'explicit current claim attestation; usage magnitude not restored';
    }
  }
  const detail = { reason, team: tenure.team, tenureFrom: tenure.from, completedOpportunities: games.length,
    opportunitiesWithoutSupport: gap, recoveryStreak: streak, lastSupportGame, futureAttestationsExcluded,
    numericalRoleContext: discontinuity ? 'REQUIRES_POST_GAP_INPUT_POLICY' : 'CONTINUOUS_UNEXPIRED' };
  if (conflict) return out('UNKNOWN_CONFLICT', detail);
  if (negative) return out('WITHDRAWN', detail);
  if (observedSupport) return out('SUPPORTED_OBSERVED', detail);
  if (positive && ms(asOf) - ms(positive.effectiveAt) <= policy.attestationDays * 86400000) {
    return out('SUPPORTED_ATTESTED', { ...detail, attestationId: positive.id });
  }
  return out('UNKNOWN_EXPIRED_OR_UNESTABLISHED', detail);
}

function availability(input: RoleInput): string {
  const candidates = input.availabilityAttestations.filter((a) => a.trusted && a.provenance
    && known(a, input.asOf) && ms(a.effectiveAt) <= ms(input.asOf)
    && ms(input.asOf) <= ms(a.validThrough));
  candidates.sort((a, b) => ms(b.effectiveAt) - ms(a.effectiveAt));
  if (!candidates.length) return 'UNKNOWN';
  const latest = candidates.filter((a) => ms(a.effectiveAt) === ms(candidates[0].effectiveAt));
  return new Set(latest.map((a) => a.status)).size === 1 ? latest[0].status : 'UNKNOWN_CONFLICT';
}
