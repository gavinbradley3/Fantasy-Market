// Frozen-engine invocation (Phase 3). Readiness-gated: an engine is called ONLY
// when the existing per-position readiness assessor returns READY with a typed,
// bounded input. Engines are used unchanged; the AIL adapts to them. Deterministic:
// the QB engine's `generated_at` is pinned to the as-of date (no wall clock).

import { evaluateWideReceiver } from '@/wr-model';
import { evaluateRunningBack } from '@/rb-model';
import { evaluateTightEnd } from '@/te-model';
import { evaluateQuarterback } from '@/qb-model';
import {
  assessQBReadiness,
  assessRBReadiness,
  assessTEReadiness,
  assessWRReadiness,
  type MissingRequirement,
} from '@/pipeline/readiness/engineReadiness';
import type { CanonicalPlayer } from '@/pipeline/types';
import type { WRMVPOutput } from '@/wr-model/types';
import type { RBMVPOutput } from '@/rb-model/types';
import type { TEMVPOutput } from '@/te-model/types';
import type { QBMVPOutput } from '@/qb-model/types';
import type { SupportedPosition } from '@/inference/types';

export type EngineOutput = WRMVPOutput | RBMVPOutput | TEMVPOutput | QBMVPOutput;

export type ReadinessStatus = 'READY' | 'NOT_READY' | 'ENGINE_UNAVAILABLE';

export interface EngineInvocation {
  readonly position: SupportedPosition;
  readonly readinessStatus: ReadinessStatus;
  readonly missing: readonly MissingRequirement[];
  readonly presentMetadata: readonly string[];
  readonly engineOutput: EngineOutput | null;
  /** engine confidence normalized to 0..1 (score/100), or null when not evaluated. */
  readonly engineConfidence01: number | null;
  /** deterministic engine-error label + message, or null. */
  readonly engineError: string | null;
}

/**
 * Assess readiness on the merged supplement and, only if READY, invoke the frozen
 * engine. Never throws for a domain outcome (NOT_READY / engine validation error);
 * such outcomes are captured deterministically in the result.
 */
export function invokeEngine(
  position: SupportedPosition,
  player: CanonicalPlayer,
  supplement: Readonly<Record<string, unknown>>,
  asOf: string,
): EngineInvocation {
  // Structural cast: each assessor re-narrows the record to its own supplement type.
  const s = supplement as never;

  switch (position) {
    case 'WR': {
      const r = assessWRReadiness(player, s, asOf);
      if (r.status !== 'READY') return notReady('WR', r);
      return evaluate('WR', () => evaluateWideReceiver(r.input), r.presentMetadata);
    }
    case 'RB': {
      const r = assessRBReadiness(player, s, asOf);
      if (r.status !== 'READY') return notReady('RB', r);
      return evaluate('RB', () => evaluateRunningBack(r.input), r.presentMetadata);
    }
    case 'TE': {
      const r = assessTEReadiness(player, s, asOf);
      if (r.status !== 'READY') return notReady('TE', r);
      return evaluate('TE', () => evaluateTightEnd(r.input), r.presentMetadata);
    }
    case 'QB': {
      const r = assessQBReadiness(player, s, asOf);
      if (r.status !== 'READY') return notReady('QB', r);
      // Pin generated_at to as-of so the QB engine reads no wall clock.
      return evaluate('QB', () => evaluateQuarterback(r.input, { generated_at: asOf }), r.presentMetadata);
    }
  }
}

function evaluate(
  position: SupportedPosition,
  run: () => EngineOutput,
  presentMetadata: readonly string[],
): EngineInvocation {
  try {
    const engineOutput = run();
    return {
      position,
      readinessStatus: 'READY',
      missing: [],
      presentMetadata,
      engineOutput,
      engineConfidence01: engineOutput.confidence.score / 100,
      engineError: null,
    };
  } catch (err) {
    const e = err as Error;
    return {
      position,
      readinessStatus: 'READY',
      missing: [],
      presentMetadata,
      engineOutput: null,
      engineConfidence01: null,
      engineError: `${e.name}: ${e.message}`,
    };
  }
}

function notReady(
  position: SupportedPosition,
  r: { status: ReadinessStatus; missing?: readonly MissingRequirement[]; presentMetadata?: readonly string[] },
): EngineInvocation {
  return {
    position,
    readinessStatus: r.status,
    missing: r.missing ?? [],
    presentMetadata: r.presentMetadata ?? [],
    engineOutput: null,
    engineConfidence01: null,
    engineError: null,
  };
}
