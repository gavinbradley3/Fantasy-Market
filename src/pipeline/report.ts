// The structured pipeline report — the human- and machine-readable account of a
// run (DESIGN §14.2 provenance; task §6). It answers: what came in, what became
// canonical, how identities resolved, what was rejected or conflicting, what is
// engine-ready, and — for everything that is not — exactly why.
//
// `ok` is the process contract: false means a TRUE pipeline failure (bad
// snapshot, nothing loaded, corrupted identities). Ordinary missing optional
// data and not-yet-ready players are reported, not failures.

import type { ProviderId, SupportedPosition } from '@/pipeline/types';
import type { RejectReason } from '@/pipeline/providers/types';

export interface StaleSnapshot {
  readonly provider: ProviderId;
  readonly retrievedAt: string;
  readonly ageHours: number;
}

export interface RejectionCount {
  readonly provider: ProviderId;
  readonly reason: RejectReason;
  readonly count: number;
}

export interface NotReadyReason {
  readonly canonicalId: string;
  readonly position: SupportedPosition;
  readonly missingCount: number;
  /** A few representative missing fields (not the whole list) for readability. */
  readonly sample: readonly string[];
}

export interface PipelineReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly mode: 'fixture' | 'live' | 'validate';

  // Intake
  readonly providerRecordsLoaded: Readonly<Record<ProviderId, number>>;
  readonly totalProviderRecords: number;
  readonly rejectedRecords: readonly RejectionCount[];
  readonly totalRejected: number;

  // Snapshots
  readonly snapshotsLoaded: number;
  readonly snapshotIntegrityFailures: readonly string[];
  readonly staleSnapshots: readonly StaleSnapshot[];

  // Canonical
  readonly supportedPlayersDiscovered: number;
  readonly canonicalPlayersGenerated: number;
  readonly countsByPosition: Readonly<Record<SupportedPosition, number>>;

  // Identity
  readonly persistedMatches: number;
  readonly crossProviderMatches: number;
  readonly newIdentities: number;
  readonly ambiguousNameCollisions: number;
  readonly duplicateCanonicalIds: number;
  readonly metadataConflicts: number;

  // Validation
  readonly validationRejections: number;
  readonly missingRequiredFieldPlayers: number;

  // Engine readiness
  readonly engineReadyPlayers: number;
  readonly playersNotEngineReady: number;
  /**
   * Players whose position has no implemented engine at all. All four supported
   * positions (WR/RB/TE/QB) now have engines, so this is 0; the field is kept so
   * a future unsupported position would surface here rather than crash.
   */
  readonly engineUnavailablePlayers: number;
  readonly notReadyReasons: readonly NotReadyReason[];

  // Statistics stage (present only when the stats stage ran).
  readonly statsStage?: StatsStageReport;

  // Snap-count stage (present only when the snap stage ran).
  readonly snapStage?: SnapStageReport;

  // Participation stage (present only when the participation stage ran).
  readonly participationStage?: ParticipationStageReport;
}

// Participation-stage metrics. Coverage-aware: only a COMPLETE-horizon authorized
// proxy can satisfy a blocking field, so `blockersSatisfied` is honest.
export interface ParticipationStageReport {
  readonly snapshotsLoaded: number;
  readonly snapshotIntegrityFailures: readonly string[];
  readonly playsAccepted: number;
  readonly playsRejected: number;
  readonly rejections: readonly StatsRejectionCount[];
  readonly incompletePersonnelPlays: number;

  readonly canonicalJoins: number;
  readonly unmatchedGsis: number;
  readonly identityCollisions: number;
  readonly recordsByPosition: Readonly<Record<SupportedPosition, number>>;

  readonly completeRouteValues: number;
  readonly partialRouteValues: number;
  readonly blockersSatisfied: number;

  readonly readinessBefore: number;
  readonly readinessAfter: number;
  readonly playersNewlyReady: number;
  readonly playersStillNotReady: number;
  readonly missingFieldsEliminated: number;
  readonly remainingGaps: { readonly stats: number; readonly projections: number; readonly context: number };
}

// Snap-count stage metrics. `readinessBefore/AfterSnaps` compare readiness with
// metadata+weekly-stats against readiness once snap supplements are merged in.
export interface SnapStageReport {
  readonly snapshotsLoaded: number;
  readonly snapshotIntegrityFailures: readonly string[];
  readonly rowsAccepted: number;
  readonly rowsRejected: number;
  readonly rejections: readonly StatsRejectionCount[];
  readonly unsupportedPositionRows: number;

  readonly canonicalJoins: number;
  readonly unmatchedSnapRows: number;
  readonly canonicalPlayersWithoutSnaps: number;
  readonly canonicalPlayersWithoutGsis: number;
  readonly teamMismatches: number;
  readonly positionMismatches: number;
  readonly identityCollisions: number;

  readonly recordsByPosition: Readonly<Record<SupportedPosition, number>>;
  readonly directMetricsSupplied: number;
  readonly proxyMetricsSupplied: number;

  readonly readinessBeforeSnaps: number;
  readonly readinessAfterSnaps: number;
  readonly playersNewlyReady: number;
  readonly playersStillNotReady: number;
  readonly missingFieldsEliminatedBySnaps: number;
  readonly remainingGaps: { readonly stats: number; readonly projections: number; readonly context: number };
}

export interface StatsRejectionCount {
  readonly reason: string;
  readonly count: number;
}

// Statistics-stage metrics (task §10). Present only when stats snapshots were
// supplied. `readinessBefore/After` compare metadata(+authored)-only readiness
// against readiness once the stats supplements are merged in.
export interface StatsStageReport {
  readonly snapshotsLoaded: number;
  readonly snapshotIntegrityFailures: readonly string[];
  readonly rowsByDatasetSeason: Readonly<Record<string, number>>;
  readonly rowsAccepted: number;
  readonly rowsRejected: number;
  readonly rejections: readonly StatsRejectionCount[];
  readonly unsupportedPositionRows: number;

  readonly canonicalJoins: number;
  readonly unmatchedStatRows: number;
  readonly canonicalPlayersWithoutStats: number;
  readonly canonicalPlayersWithoutGsis: number;
  readonly positionMismatches: number;
  readonly identityCollisions: number;

  readonly recordsByPosition: Readonly<Record<SupportedPosition, number>>;
  readonly aggregateRecordsProduced: number;
  readonly derivedMetricsProduced: number;
  readonly unavailableRequiredMetrics: number;

  readonly readinessBeforeStats: number;
  readonly readinessAfterStats: number;
  readonly playersNewlyReady: number;
  readonly playersStillNotReady: number;
  readonly missingFieldsEliminatedByStats: number;
  readonly remainingGaps: { readonly stats: number; readonly projections: number; readonly context: number };
}

/** A stable one-object-per-line-ish text rendering for the CLI. */
export function renderReport(report: PipelineReport): string {
  const lines: string[] = [];
  const L = (s: string) => lines.push(s);
  L(`PlayerTicker pipeline report (${report.mode}) — ${report.ok ? 'OK' : 'FAILED'}`);
  L(`  generatedAt: ${report.generatedAt}`);
  L('  Intake:');
  for (const p of Object.keys(report.providerRecordsLoaded).sort()) {
    L(`    ${p}: ${report.providerRecordsLoaded[p as ProviderId]} records`);
  }
  L(`    total: ${report.totalProviderRecords} records, ${report.totalRejected} rejected`);
  if (report.rejectedRecords.length > 0) {
    for (const r of report.rejectedRecords) L(`      - ${r.provider}/${r.reason}: ${r.count}`);
  }
  L('  Snapshots:');
  L(`    loaded: ${report.snapshotsLoaded}, integrity failures: ${report.snapshotIntegrityFailures.length}`);
  for (const f of report.snapshotIntegrityFailures) L(`      ! ${f}`);
  for (const s of report.staleSnapshots) L(`      stale: ${s.provider} (${s.ageHours}h old)`);
  L('  Canonical:');
  L(`    supported discovered: ${report.supportedPlayersDiscovered}`);
  L(`    canonical generated: ${report.canonicalPlayersGenerated}`);
  L(
    `    by position: QB=${report.countsByPosition.QB} RB=${report.countsByPosition.RB} ` +
      `WR=${report.countsByPosition.WR} TE=${report.countsByPosition.TE}`,
  );
  L('  Identity:');
  L(`    persisted matches: ${report.persistedMatches}, cross-provider matches: ${report.crossProviderMatches}`);
  L(`    new identities: ${report.newIdentities}`);
  L(`    ambiguous name collisions: ${report.ambiguousNameCollisions}`);
  L(`    duplicate canonical ids: ${report.duplicateCanonicalIds}`);
  L(`    metadata conflicts: ${report.metadataConflicts}`);
  L('  Validation:');
  L(`    validation rejections: ${report.validationRejections}`);
  L(`    players missing required metadata: ${report.missingRequiredFieldPlayers}`);
  L('  Engine readiness:');
  L(`    engine-ready: ${report.engineReadyPlayers}`);
  L(`    not engine-ready: ${report.playersNotEngineReady}`);
  L(`    positions with no engine: ${report.engineUnavailablePlayers}`);
  for (const r of report.notReadyReasons.slice(0, 10)) {
    L(`      - ${r.canonicalId} (${r.position}): ${r.missingCount} missing [${r.sample.join(', ')}…]`);
  }
  if (report.statsStage) {
    const s = report.statsStage;
    L('  Statistics stage:');
    L(`    snapshots: ${s.snapshotsLoaded}, integrity failures: ${s.snapshotIntegrityFailures.length}`);
    for (const f of s.snapshotIntegrityFailures) L(`      ! ${f}`);
    L(`    rows accepted: ${s.rowsAccepted}, rejected: ${s.rowsRejected}, unsupported-position: ${s.unsupportedPositionRows}`);
    for (const r of s.rejections) L(`      - ${r.reason}: ${r.count}`);
    L(
      `    joins: ${s.canonicalJoins} (unmatched rows-gsis: ${s.unmatchedStatRows}, ` +
        `canonical w/o stats: ${s.canonicalPlayersWithoutStats}, w/o gsis: ${s.canonicalPlayersWithoutGsis})`,
    );
    L(`    identity collisions: ${s.identityCollisions}, position mismatches: ${s.positionMismatches}`);
    L(
      `    by position: QB=${s.recordsByPosition.QB} RB=${s.recordsByPosition.RB} ` +
        `WR=${s.recordsByPosition.WR} TE=${s.recordsByPosition.TE}`,
    );
    L(`    derived metrics supplied: ${s.derivedMetricsProduced}, unavailable required: ${s.unavailableRequiredMetrics}`);
    L(`    readiness before stats: ${s.readinessBeforeStats} → after stats: ${s.readinessAfterStats}`);
    L(`    newly ready: ${s.playersNewlyReady}, still not ready: ${s.playersStillNotReady}`);
    L(`    missing fields eliminated by stats: ${s.missingFieldsEliminatedByStats}`);
    L(
      `    remaining gaps → stats: ${s.remainingGaps.stats}, projections: ${s.remainingGaps.projections}, ` +
        `context: ${s.remainingGaps.context}`,
    );
  }
  if (report.snapStage) {
    const s = report.snapStage;
    L('  Snap-count stage:');
    L(`    snapshots: ${s.snapshotsLoaded}, integrity failures: ${s.snapshotIntegrityFailures.length}`);
    for (const f of s.snapshotIntegrityFailures) L(`      ! ${f}`);
    L(`    rows accepted: ${s.rowsAccepted}, rejected: ${s.rowsRejected}, unsupported-position: ${s.unsupportedPositionRows}`);
    for (const r of s.rejections) L(`      - ${r.reason}: ${r.count}`);
    L(
      `    joins: ${s.canonicalJoins} (unmatched: ${s.unmatchedSnapRows}, w/o snaps: ${s.canonicalPlayersWithoutSnaps}, ` +
        `w/o gsis: ${s.canonicalPlayersWithoutGsis})`,
    );
    L(`    team mismatches: ${s.teamMismatches}, position mismatches: ${s.positionMismatches}, identity collisions: ${s.identityCollisions}`);
    L(
      `    by position: QB=${s.recordsByPosition.QB} RB=${s.recordsByPosition.RB} ` +
        `WR=${s.recordsByPosition.WR} TE=${s.recordsByPosition.TE}`,
    );
    L(`    direct metrics supplied: ${s.directMetricsSupplied}, proxy metrics supplied: ${s.proxyMetricsSupplied}`);
    L(`    readiness before snaps: ${s.readinessBeforeSnaps} → after snaps: ${s.readinessAfterSnaps}`);
    L(`    newly ready: ${s.playersNewlyReady}, still not ready: ${s.playersStillNotReady}`);
    L(`    missing fields eliminated by snaps: ${s.missingFieldsEliminatedBySnaps}`);
    L(
      `    remaining gaps → stats: ${s.remainingGaps.stats}, projections: ${s.remainingGaps.projections}, ` +
        `context: ${s.remainingGaps.context}`,
    );
  }
  if (report.participationStage) {
    const s = report.participationStage;
    L('  Participation stage:');
    L(`    snapshots: ${s.snapshotsLoaded}, integrity failures: ${s.snapshotIntegrityFailures.length}`);
    for (const f of s.snapshotIntegrityFailures) L(`      ! ${f}`);
    L(`    plays accepted: ${s.playsAccepted}, rejected: ${s.playsRejected}, incomplete-personnel: ${s.incompletePersonnelPlays}`);
    for (const r of s.rejections) L(`      - ${r.reason}: ${r.count}`);
    L(`    joins: ${s.canonicalJoins} (unmatched gsis: ${s.unmatchedGsis}, identity collisions: ${s.identityCollisions})`);
    L(`    complete route values: ${s.completeRouteValues}, partial (non-satisfying): ${s.partialRouteValues}`);
    L(`    blocking fields satisfied: ${s.blockersSatisfied}`);
    L(`    readiness before: ${s.readinessBefore} → after: ${s.readinessAfter}`);
    L(`    newly ready: ${s.playersNewlyReady}, still not ready: ${s.playersStillNotReady}`);
    L(`    missing fields eliminated: ${s.missingFieldsEliminated}`);
    L(
      `    remaining gaps → stats: ${s.remainingGaps.stats}, projections: ${s.remainingGaps.projections}, ` +
        `context: ${s.remainingGaps.context}`,
    );
  }
  return lines.join('\n');
}
