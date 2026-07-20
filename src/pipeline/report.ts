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
  return lines.join('\n');
}
