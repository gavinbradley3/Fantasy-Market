// Centralized qualifying-pass-play (dropback) registry. Team dropbacks and
// player pass-play participation MUST use this single definition so numerator and
// denominator never diverge.
//
// A qualifying dropback is a live pass-intent play: a pass attempt (complete,
// incomplete, or intercepted), a sack, or a QB scramble (a route was run before
// the QB took off). Explicitly EXCLUDED — these are not routes:
//   • designed runs            • spikes            • kneel-downs
//   • two-point attempts       • nullified plays (no_play / offsetting penalties)
// A loose `play_type === 'pass'` is NOT used; the flag combination below matches
// the WR spec's route-proxy intent.

import type { ParticipationPlayRaw } from '@/pipeline/participation/nflverse/participationSchema';

function truthy(v: number | string | boolean | null | undefined): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  const s = v.trim().toLowerCase();
  return s === '1' || s === 'true';
}

export interface QualificationResult {
  readonly isDropback: boolean;
  readonly excludedReason?: string;
}

export function qualifyPlay(p: ParticipationPlayRaw): QualificationResult {
  const playType = (p.play_type ?? '').toLowerCase();

  // Hard exclusions first (order matters: a nullified play is never a dropback).
  if (playType === 'no_play') return { isDropback: false, excludedReason: 'no_play/nullified' };
  if (truthy(p.qb_kneel) || playType === 'qb_kneel') return { isDropback: false, excludedReason: 'kneel' };
  if (truthy(p.qb_spike) || playType === 'qb_spike') return { isDropback: false, excludedReason: 'spike' };
  if (truthy(p.two_point_attempt)) return { isDropback: false, excludedReason: 'two_point' };

  const isPass = truthy(p.pass) || playType === 'pass';
  const isSack = truthy(p.sack);
  const isScramble = truthy(p.qb_scramble);
  if (isPass || isSack || isScramble) return { isDropback: true };

  return { isDropback: false, excludedReason: 'designed_run_or_other' };
}
