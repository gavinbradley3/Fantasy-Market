import type { NormalizedSnapshot } from '@/ingestion';
import type { ExperimentalPlayerDiagnostic } from './experimentalInSeason';
import { assessExperimentalRoleEvidence, CONTRACT } from './experimentalRoleEvidence';
import { roleReferenceChecksum, type RoleAssessment, type RoleState, type ValidatedRoleReferences } from './experimentalRoleReferences';

export type RoleTerminalCategory = 'numerically_eligible' | 'legitimate_insufficient' | 'held_expired_role'
  | 'held_unknown_role' | 'blocked_reference_coverage' | 'blocked_source_coverage' | 'failed_inference' | 'unsupported_model_path';
export interface GatedPlayerDiagnostic extends ExperimentalPlayerDiagnostic {
  readonly numericallyEligible: boolean;
  readonly terminalCategory: RoleTerminalCategory;
  readonly roleEvidence: RoleAssessment | null;
  readonly roleEvidenceState: RoleState;
  readonly roleReason: string;
  readonly referenceCoverageComplete: boolean;
  readonly historicalPerformanceChecksum: string;
  readonly baselineDiagnostic: {
    readonly eligible: false;
    readonly inferenceStatus: ExperimentalPlayerDiagnostic['inferenceStatus'];
    readonly historicalRoleClaim: string | null;
    readonly outputChecksum: string | null;
  };
}
const categories: readonly RoleTerminalCategory[] = ['numerically_eligible', 'legitimate_insufficient', 'held_expired_role',
  'held_unknown_role', 'blocked_reference_coverage', 'blocked_source_coverage', 'failed_inference', 'unsupported_model_path'];

/** Diagnostic projection only: no engineOutput, accessibleOutput, rank or value escapes. */
export function applyExperimentalRoleGate(players: readonly ExperimentalPlayerDiagnostic[], references: ValidatedRoleReferences,
  sourcePlanComplete: boolean, asOf: string, snapshot: NormalizedSnapshot | null) {
  const gated: GatedPlayerDiagnostic[] = players.map((player) => {
    const reference = references.bundle?.players.find((p) => p.canonicalId === player.canonicalId && p.position === player.position);
    // References augment missing completion/tenure proof; they cannot silently contradict
    // the captured model observations or omit a known scheduled opportunity in their scope.
    const crossReferenceFailure = reference && snapshot && references.bundle ? (() => {
      const e = reference.evidence;
      const teams = new Set(e.memberships.map((m) => m.team));
      const missingGame = snapshot.schedule.some((g) => g.seasonType === 'REG'
        && (teams.has(g.homeTeam) || teams.has(g.awayTeam))
        && Date.parse(g.kickoff) >= Date.parse(references.bundle!.coverageFrom) && Date.parse(g.kickoff) <= Date.parse(asOf)
        && [g.homeTeam, g.awayTeam].filter((team) => teams.has(team))
          .some((team) => !e.opportunities.some((r) => r.id === g.gameId && r.team === team && r.seasonType === g.seasonType)));
      if (missingGame) return 'ROLE_REFERENCE_SCHEDULE_GAP';
      // All captured historical game coordinates must be retained, including old-team and
      // career rows before coverageFrom. Otherwise omission could erase a sticky discontinuity.
      if (snapshot.games.some((g) => g.canonicalId === player.canonicalId && g.seasonType === 'REG'
        && Date.parse(g.kickoff) <= Date.parse(asOf)
        && !e.observations.some((o) => o.gameId === g.gameId && o.team === g.team
          && Date.parse(o.observedAt) <= Date.parse(asOf) && Date.parse(o.knownAt) <= Date.parse(asOf)))) {
        return 'ROLE_REFERENCE_HISTORICAL_OBSERVATION_GAP';
      }
      const conflict = e.observations.filter((o) => Date.parse(o.observedAt) <= Date.parse(asOf) && Date.parse(o.knownAt) <= Date.parse(asOf)).some((o) => {
        const game = snapshot.games.find((g) => g.canonicalId === player.canonicalId && g.gameId === o.gameId && g.team === o.team);
        if (!game) return true;
        if (player.position === 'QB') return o.officialStart === true && !snapshot.officialStarts.some((s) => s.canonicalId === player.canonicalId && s.gameId === o.gameId);
        return (o.targets != null && game.targets !== o.targets) || (player.position === 'RB' && o.carries != null && game.carries !== o.carries);
      });
      return conflict ? 'ROLE_REFERENCE_OBSERVATION_MISMATCH' : null;
    })() : null;
    const assessment = reference ? assessExperimentalRoleEvidence({ ...reference.evidence,
      asOf, position: player.position, claim: player.roleClaim ?? 'UNESTABLISHED' }) : null;
    // Reference timestamps cannot redate the historical workload actually used by the model.
    if (assessment?.tenureFrom && snapshot?.games.some((g) => g.canonicalId === player.canonicalId
      && Date.parse(g.kickoff) < Date.parse(assessment.tenureFrom!) && Date.parse(g.kickoff) <= Date.parse(asOf))) {
      assessment.numericalRoleContext = 'REQUIRES_POST_GAP_INPUT_POLICY';
      if (assessment.downstream === 'EXISTING_PATH_CANDIDATE') assessment.downstream = 'HOLD_CURRENT_VALUE_ROLE_INPUT_CONTRACT_UNSUPPORTED';
    }
    const evidenceCoverageMissing = reference && (['mandatorySources', 'completion', 'playerObservations', 'membership'] as const)
      .some((key) => reference.evidence.coverage[key]?.complete !== true);
    const referenceCoverageComplete = references.complete && Boolean(reference) && !crossReferenceFailure
      && !evidenceCoverageMissing && assessment?.currentRoleEvidence !== 'REFERENCE_INCOMPLETE';
    if (assessment && !referenceCoverageComplete) {
      assessment.currentRoleEvidence = 'REFERENCE_INCOMPLETE'; assessment.currentClaim = null;
      assessment.downstream = 'RUN_REFERENCE_INCOMPLETE';
      assessment.reason = crossReferenceFailure ?? (evidenceCoverageMissing ? 'ROLE_REFERENCE_REQUIRED_COVERAGE_MISSING' : assessment.reason);
    }
    let terminalCategory: RoleTerminalCategory;
    if (!sourcePlanComplete) terminalCategory = 'blocked_source_coverage';
    else if (!referenceCoverageComplete) terminalCategory = 'blocked_reference_coverage';
    else if (['failed_inference', 'missing_inference', 'malformed_null_result'].includes(player.inferenceStatus)) terminalCategory = 'failed_inference';
    else if (player.inferenceStatus === 'unsupported_model_path') terminalCategory = 'unsupported_model_path';
    else if (player.inferenceStatus === 'legitimate_insufficient') terminalCategory = 'legitimate_insufficient';
    else if (assessment?.downstream === 'EXISTING_PATH_CANDIDATE' && player.selectedPathHasRequiredEvidence) terminalCategory = 'numerically_eligible';
    else if (assessment?.currentRoleEvidence === 'UNKNOWN_EXPIRED_OR_UNESTABLISHED'
      && (assessment.opportunitiesWithoutSupport ?? 0) >= CONTRACT.expiry[player.position]) terminalCategory = 'held_expired_role';
    else terminalCategory = 'held_unknown_role';
    const numericallyEligible = terminalCategory === 'numerically_eligible';
    return {
      ...player,
      // No held row carries an eligible value/checksum. Valid qualitative restoration may
      // have a current claim while its numerical context remains held.
      valued: numericallyEligible, outputChecksum: numericallyEligible ? player.outputChecksum : null,
      roleClaim: sourcePlanComplete && referenceCoverageComplete ? assessment?.currentClaim ?? null : null,
      numericallyEligible, terminalCategory, roleEvidence: assessment, referenceCoverageComplete,
      roleEvidenceState: assessment?.currentRoleEvidence ?? 'REFERENCE_INCOMPLETE',
      roleReason: !references.complete ? references.reason! : !reference ? 'ROLE_PLAYER_REFERENCE_MISSING'
        : crossReferenceFailure ?? assessment?.reason ?? assessment?.currentRoleEvidence ?? 'ROLE_REFERENCE_UNAVAILABLE',
      historicalPerformanceChecksum: roleReferenceChecksum(snapshot?.games.filter((g) => g.canonicalId === player.canonicalId) ?? []),
      baselineDiagnostic: { eligible: false, inferenceStatus: player.inferenceStatus,
        historicalRoleClaim: player.roleClaim, outputChecksum: player.outputChecksum },
    };
  });
  const byPosition = Object.fromEntries((['QB', 'RB', 'WR', 'TE'] as const).map((position) => {
    const group = gated.filter((p) => p.position === position);
    return [position, { selected: group.length, ...Object.fromEntries(categories.map((c) => [c, group.filter((p) => p.terminalCategory === c).length])) }];
  }));
  return {
    players: gated,
    rolePolicyId: CONTRACT.id,
    referenceIdentity: references.identity,
    referenceCoverageComplete: references.complete && gated.every((p) => p.referenceCoverageComplete),
    referenceFailure: references.reason,
    playerReferenceFailures: gated.filter((p) => !p.referenceCoverageComplete).map((p) => ({ canonicalId: p.canonicalId, reason: p.roleReason })),
    eligiblePlayers: gated.filter((p) => p.numericallyEligible).map((p) => ({ canonicalId: p.canonicalId, position: p.position })),
    byPosition,
    numericalEvaluationComplete: gated.length > 0 && gated.every((p) => ['numerically_eligible', 'legitimate_insufficient'].includes(p.terminalCategory)),
  };
}
