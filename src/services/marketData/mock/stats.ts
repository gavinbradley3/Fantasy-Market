// Deterministic mock stat lines and game logs (§28.3). Every line is flagged
// isMock and displayed as "2025 season (demo data)" — never framed as "this
// week" (§28.4). Values are derived from the player's authored sub-scores so the
// stats agree with the market profile.

import { seededRandom } from '@/lib/prng';
import type { ComputedPlayer } from '@/services/marketData/mock/buildDataset';
import type { PlayerStatsGameLog, PlayerStatsSeason, Position } from '@/types/market';

const DEMO_SEASON = 2025;
const OPPONENTS = ['DAL', 'SF', 'GB', 'KC', 'PHI', 'BAL', 'DET', 'BUF', 'CIN', 'MIA', 'SEA', 'HOU'];

function ppgFor(pos: Position, prod: number, scoring: 'ppr' | 'half'): number {
  // Map a 0–100 production score to a plausible PPG range per position.
  const base: Record<Position, [number, number]> = {
    QB: [12, 26],
    RB: [6, 24],
    WR: [6, 23],
    TE: [4, 18],
  };
  const [lo, hi] = base[pos];
  const pprBoost = scoring === 'ppr' && pos !== 'QB' ? 2.2 : 0;
  return Math.round((lo + (hi - lo) * (prod / 100) + pprBoost) * 10) / 10;
}

export function seasonStats(cp: ComputedPlayer): PlayerStatsSeason {
  const s = cp.seed;
  if (cp.player.isRookie) {
    return {
      playerId: cp.player.identity.internal_id,
      season: DEMO_SEASON,
      games: 0,
      ppg: { ppr: 0, half: 0 },
      isMock: true,
    };
  }
  return {
    playerId: cp.player.identity.internal_id,
    season: DEMO_SEASON,
    games: s.games,
    ppg: { ppr: ppgFor(s.pos, s.prod, 'ppr'), half: ppgFor(s.pos, s.prod, 'half') },
    snapPct: s.pos === 'QB' ? 99 : Math.round(50 + s.usage * 0.45),
    targetShare: s.pos === 'RB' ? undefined : Math.round(s.opp * 0.28),
    carryShare: s.pos === 'RB' ? Math.round(s.opp * 0.55) : undefined,
    redZoneShare: Math.round(s.opp * 0.24),
    totalTds: Math.round((s.td / 100) * (s.pos === 'QB' ? 34 : 12)),
    isMock: true,
  };
}

export function gameLog(cp: ComputedPlayer): PlayerStatsGameLog[] {
  if (cp.player.isRookie) return [];
  const rng = seededRandom(cp.player.identity.internal_id, 'gamelog');
  const half = ppgFor(cp.seed.pos, cp.seed.prod, 'half');
  const logs: PlayerStatsGameLog[] = [];
  for (let w = 6; w >= 1; w--) {
    const variance = (rng() - 0.5) * half * 0.9;
    const half_ = Math.max(0, Math.round((half + variance) * 10) / 10);
    const ppr_ = Math.round((half_ + (cp.seed.pos === 'QB' ? 0 : 3.2 * rng() + 1.5)) * 10) / 10;
    logs.push({
      playerId: cp.player.identity.internal_id,
      season: DEMO_SEASON,
      week: 18 - (6 - w),
      opponent: OPPONENTS[Math.floor(rng() * OPPONENTS.length)],
      fantasyPoints: { ppr: ppr_, half: half_ },
      keyLine: keyLineFor(cp.seed.pos, half_, rng),
      isMock: true,
    });
  }
  return logs;
}

function keyLineFor(pos: Position, pts: number, rng: () => number): string {
  const r = (n: number) => Math.round(n);
  switch (pos) {
    case 'QB':
      return `${r(200 + pts * 9)} pass yds, ${r(pts / 9)} TD`;
    case 'RB':
      return `${r(8 + pts * 0.6)} car, ${r(40 + pts * 4)} yds, ${rng() > 0.5 ? 1 : 0} TD`;
    case 'WR':
    case 'TE':
      return `${r(3 + pts * 0.35)} rec, ${r(30 + pts * 4.5)} yds, ${rng() > 0.6 ? 1 : 0} TD`;
  }
}

// Format notes (§23.11): 1–2 lines on how value differs in other formats.
export function formatNotes(cp: ComputedPlayer): string[] {
  const notes: string[] = [];
  const { position } = cp.player;
  if (position === 'QB') {
    notes.push('In 1QB leagues, QB scarcity disappears — this price drops sharply as the Superflex premium is removed.');
  } else {
    notes.push('WR/RB/TE values are unaffected by the 1QB ↔ Superflex toggle; only the surrounding QB pool re-percentiles.');
  }
  if (position === 'RB' || position === 'WR') {
    notes.push('In full PPR, pass-catching usage nudges this value up a few points versus Half-PPR.');
  }
  return notes;
}
