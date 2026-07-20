// Route-proxy authorization registry. Encodes, per binding specification, which
// snap-derived route proxy a position may use — so a derivation authorized for
// one position is NEVER silently applied to another (task: no cross-position
// assumption leakage).
//
// Two distinct, non-interchangeable proxies exist in the specs:
//   • WR: proxy routes = pass snaps × 0.97  (WR_VALUATION §5.1.4 / lines 175, 962).
//     A route COUNT/participation estimate from PASS-PLAY snaps. WR-only.
//   • TE: route_proxy = clamp(snap_share_last4 × 0.72, 0, 0.85)
//     (TE_VALUATION §26.5.2.2). This one is OWNED BY THE FROZEN TE ENGINE — the
//     engine applies it internally (with logged penalties) when RP4/RP8 are null
//     and snap_share_last4 is present. The pipeline therefore NEVER computes it;
//     it only supplies snap_share_last4. It is recorded here as engine-owned so
//     no code mistakes the WR 0.97 rule for a TE route source.
//
// The WR proxy's INPUT is PASS-PLAY snaps, which the nflverse snap-count dataset
// does not carry (it has total offensive snaps only; pass/run split needs pbp).
// So the WR proxy is authorized and implemented but cannot be activated from this
// dataset — reported UNAVAILABLE with its missing input, never faked.

import type { SupportedPosition } from '@/pipeline/types';

export type ProxyId = 'WR_ROUTES_FROM_PASS_SNAPS' | 'TE_ROUTE_FROM_SNAP_SHARE';

export interface ProxyDefinition {
  readonly id: ProxyId;
  readonly authorizedPositions: ReadonlySet<SupportedPosition>;
  readonly spec: string;
  /** Engine-owned proxies are applied inside the frozen engine, not the pipeline. */
  readonly owner: 'pipeline' | 'engine';
  /** The input the proxy consumes, and whether this dataset can supply it. */
  readonly requiredInput: string;
  readonly inputAvailableFromSnapCounts: boolean;
}

export const WR_ROUTE_PROXY: ProxyDefinition = {
  id: 'WR_ROUTES_FROM_PASS_SNAPS',
  authorizedPositions: new Set(['WR']),
  spec: 'WR_VALUATION_MODEL_v1.2 §5.1.4 (lines 175, 962): proxy routes = pass snaps × 0.97',
  owner: 'pipeline',
  requiredInput: 'pass_play_snaps',
  inputAvailableFromSnapCounts: false, // pass/run split needs pbp, not snap counts
};

export const TE_ROUTE_PROXY: ProxyDefinition = {
  id: 'TE_ROUTE_FROM_SNAP_SHARE',
  authorizedPositions: new Set(['TE']),
  spec: 'TE_VALUATION_REFERENCE_V1 §26.5.2.2: clamp(snap_share_last4 × 0.72, 0, 0.85)',
  owner: 'engine', // the frozen TE engine applies this; the pipeline supplies snap_share_last4
  requiredInput: 'snap_share_last4',
  inputAvailableFromSnapCounts: true,
};

export const WR_PROXY_FACTOR = 0.97;

export function isProxyAuthorized(id: ProxyId, position: SupportedPosition): boolean {
  const def = id === 'WR_ROUTES_FROM_PASS_SNAPS' ? WR_ROUTE_PROXY : TE_ROUTE_PROXY;
  return def.authorizedPositions.has(position);
}

export type ProxyResult =
  | { readonly ok: true; readonly value: number; readonly provenance: 'PROXY' }
  | { readonly ok: false; readonly reason: 'UNAUTHORIZED' | 'INPUT_UNAVAILABLE' };

/**
 * Compute WR proxy routes = pass snaps × 0.97 — ONLY for WR (the authorized
 * position). Any other position is rejected UNAUTHORIZED (no leakage). Pass
 * `passSnaps = null` when the input is not available (this dataset) → the caller
 * receives INPUT_UNAVAILABLE, never a fabricated value.
 */
export function computeWrProxyRoutes(
  position: SupportedPosition,
  passSnaps: number | null,
): ProxyResult {
  if (!isProxyAuthorized('WR_ROUTES_FROM_PASS_SNAPS', position)) {
    return { ok: false, reason: 'UNAUTHORIZED' };
  }
  if (passSnaps === null || !Number.isFinite(passSnaps) || passSnaps < 0) {
    return { ok: false, reason: 'INPUT_UNAVAILABLE' };
  }
  return { ok: true, value: passSnaps * WR_PROXY_FACTOR, provenance: 'PROXY' };
}
