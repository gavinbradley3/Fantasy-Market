// Build partial snap supplements + an honest per-field availability report.
//
// What the snap-count dataset can DIRECTLY supply (offensive snap share):
//   • RB: snap_share_last4, snap_share_last8, previous_snap_share
//   • TE: snap_share_last4  (this also arms the TE engine's own §26.5.2.2 route
//         proxy: the pipeline supplies snap_share_last4 and leaves the route
//         fields null; the frozen engine applies clamp(snap_share×0.72,0,0.85)).
//
// What it CANNOT supply (reported, never faked):
//   • WR route participation / proxy routes — the WR proxy consumes PASS-play
//     snaps (pbp), absent from snap counts (proxyRegistry: INPUT_UNAVAILABLE).
//   • RB carry share — denominator is team non-QB rush attempts (weekly team
//     stats), not snaps.
//   • QB starts — snap counts cannot distinguish a starter from an early entrant.

import { snapShare } from '@/pipeline/snaps/aggregate';
import { computeWrProxyRoutes } from '@/pipeline/snaps/proxyRegistry';
import type { PlayerSnapAggregate, SnapWindow } from '@/pipeline/snaps/types';
import type { SupportedPosition } from '@/pipeline/types';

export type SnapProvenance = 'DIRECT' | 'PROXY' | 'ENGINE_OWNED_PROXY';
export type SnapAvailability = 'SUPPLIED' | 'UNAVAILABLE' | 'NOT_APPLICABLE';

export interface SnapFieldReport {
  readonly field: string;
  readonly availability: SnapAvailability;
  readonly provenance?: SnapProvenance;
  readonly window?: SnapWindow;
  readonly value?: number | null;
  readonly reason?: string;
}

export interface BuiltSnapSupplement {
  readonly canonicalId: string;
  readonly position: SupportedPosition;
  readonly supplement: Record<string, number | null>;
  readonly fields: readonly SnapFieldReport[];
  readonly directSupplied: number;
  readonly proxySupplied: number;
}

const CARRY_SHARE_REASON =
  'carry share denominator is team non-QB rush attempts (weekly team stats), not snap counts';
const STARTS_REASON = 'snap counts cannot distinguish a starter from a backup who entered early';

class SnapBuilder {
  readonly supplement: Record<string, number | null> = {};
  readonly fields: SnapFieldReport[] = [];
  directSupplied = 0;
  proxySupplied = 0;

  snapShareField(field: string, window: SnapWindow, value: number | null): void {
    this.supplement[field] = value;
    if (value === null) {
      this.fields.push({ field, availability: 'UNAVAILABLE', window, value: null, reason: 'insufficient snap sample in window' });
    } else {
      this.fields.push({ field, availability: 'SUPPLIED', provenance: 'DIRECT', window, value });
      this.directSupplied += 1;
    }
  }

  unavailable(field: string, reason: string): void {
    this.fields.push({ field, availability: 'UNAVAILABLE', reason });
  }

  note(field: string, availability: SnapAvailability, provenance: SnapProvenance, reason: string): void {
    this.fields.push({ field, availability, provenance, reason });
  }
}

function buildRB(a: PlayerSnapAggregate, b: SnapBuilder): void {
  b.snapShareField('snap_share_last4', 'LAST_4', snapShare(a.windows.LAST_4));
  b.snapShareField('snap_share_last8', 'LAST_8', snapShare(a.windows.LAST_8));
  b.snapShareField('previous_snap_share', 'PREVIOUS_SEASON', snapShare(a.windows.PREVIOUS_SEASON));
  b.unavailable('carry_share_last4', CARRY_SHARE_REASON);
  b.unavailable('route_participation_last4', 'RB route proxy needs pass-play snaps (pbp), not snap counts');
}

function buildTE(a: PlayerSnapAggregate, b: SnapBuilder): void {
  const s4 = snapShare(a.windows.LAST_4);
  b.snapShareField('snap_share_last4', 'LAST_4', s4);
  // The TE engine owns the snap→route proxy (§26.5.2.2); supplying snap_share_last4
  // arms it. The pipeline does NOT fill route_participation itself.
  b.note(
    'route_participation_last4',
    s4 === null ? 'UNAVAILABLE' : 'NOT_APPLICABLE',
    'ENGINE_OWNED_PROXY',
    s4 === null
      ? 'no snap share to arm the TE engine proxy'
      : 'left null so the frozen TE engine applies clamp(snap_share×0.72,0,0.85) with its penalty',
  );
}

function buildWR(_a: PlayerSnapAggregate, b: SnapBuilder): void {
  // WR proxy is authorized but its input (pass-play snaps) is unavailable here.
  const proxy = computeWrProxyRoutes('WR', null);
  b.note(
    'career_routes',
    'UNAVAILABLE',
    'PROXY',
    proxy.ok ? 'proxy computed' : `WR route proxy (pass snaps × 0.97) input unavailable: ${proxy.reason}`,
  );
  b.unavailable('route_participation_last4', 'WR route proxy needs pass-play snaps (pbp), not snap counts');
}

function buildQB(_a: PlayerSnapAggregate, b: SnapBuilder): void {
  b.unavailable('career_starts', STARTS_REASON);
  b.unavailable('recent_starts', STARTS_REASON);
}

const BUILDERS: Record<SupportedPosition, (a: PlayerSnapAggregate, b: SnapBuilder) => void> = {
  RB: buildRB,
  TE: buildTE,
  WR: buildWR,
  QB: buildQB,
};

export function buildSnapSupplement(a: PlayerSnapAggregate): BuiltSnapSupplement {
  const b = new SnapBuilder();
  BUILDERS[a.position](a, b);
  b.fields.sort((x, y) => x.field.localeCompare(y.field));
  return {
    canonicalId: a.canonicalId,
    position: a.position,
    supplement: b.supplement,
    fields: b.fields,
    directSupplied: b.directSupplied,
    proxySupplied: b.proxySupplied,
  };
}
