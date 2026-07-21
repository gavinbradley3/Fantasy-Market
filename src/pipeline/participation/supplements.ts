// Build a partial participation supplement + coverage-aware field report.
//
// Only WR `career_routes` is produced, and ONLY when coverage is COMPLETE, via
// the WR-authorized proxy (routes = qualifying pass-play participations × 0.97,
// applied to the final aggregate). A PARTIAL or UNAVAILABLE coverage yields NO
// value — it is reported, never numerically hidden. RB/TE/QB get nothing: the WR
// proxy is WR-only; TE's route proxy is engine-owned; QB starts are not derivable
// from participation.

import { computeWrProxyRoutes } from '@/pipeline/snaps/proxyRegistry';
import type { PlayerParticipationAggregate, CoverageState } from '@/pipeline/participation/types';

export type ParticipationProvenance = 'PROXY';
export type ParticipationAvailability = 'SUPPLIED' | 'PARTIAL' | 'UNAVAILABLE' | 'NOT_APPLICABLE';

export interface ParticipationFieldReport {
  readonly field: string;
  readonly availability: ParticipationAvailability;
  readonly coverage: CoverageState;
  readonly provenance?: ParticipationProvenance;
  readonly value?: number;
  readonly reason?: string;
}

export interface BuiltParticipationSupplement {
  readonly canonicalId: string;
  readonly supplement: Record<string, number>;
  readonly fields: readonly ParticipationFieldReport[];
  /** True when a COMPLETE-horizon authorized proxy filled a blocking field. */
  readonly satisfiedBlocker: boolean;
}

export function buildParticipationSupplement(a: PlayerParticipationAggregate): BuiltParticipationSupplement {
  const fields: ParticipationFieldReport[] = [];
  const supplement: Record<string, number> = {};
  let satisfiedBlocker = false;

  if (a.position !== 'WR') {
    // The WR ×0.97 proxy is authorized for WR only; TE route proxy is engine
    // owned; QB starts are not derivable from presence.
    const reason =
      a.position === 'QB'
        ? 'participation presence is not an official start; career_starts/recent_starts not populated'
        : `WR route proxy is not authorized for ${a.position}`;
    fields.push({ field: 'career_routes', availability: 'NOT_APPLICABLE', coverage: 'NOT_APPLICABLE', reason });
    return { canonicalId: a.canonicalId, supplement, fields, satisfiedBlocker };
  }

  const cov = a.coverage.state;
  if (cov !== 'COMPLETE') {
    fields.push({
      field: 'career_routes',
      availability: cov === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'PARTIAL',
      coverage: cov,
      reason: a.coverage.reason ?? 'incomplete career coverage — partial data cannot satisfy a full-career field',
    });
    return { canonicalId: a.canonicalId, supplement, fields, satisfiedBlocker };
  }

  // COMPLETE coverage → authorized WR proxy on the final aggregate. Full internal
  // precision (the spec does not mandate rounding a proxy route total).
  const proxy = computeWrProxyRoutes('WR', a.qualifyingPassPlayParticipations);
  if (proxy.ok) {
    supplement.career_routes = proxy.value;
    satisfiedBlocker = true;
    fields.push({
      field: 'career_routes',
      availability: 'SUPPLIED',
      coverage: 'COMPLETE',
      provenance: 'PROXY',
      value: proxy.value,
    });
  } else {
    fields.push({
      field: 'career_routes',
      availability: 'UNAVAILABLE',
      coverage: cov,
      reason: `WR proxy unavailable: ${proxy.reason}`,
    });
  }
  return { canonicalId: a.canonicalId, supplement, fields, satisfiedBlocker };
}
