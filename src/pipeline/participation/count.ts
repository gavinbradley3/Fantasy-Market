// Player pass-play participation counting + team dropback denominators, from
// the SAME qualification rule (playQualification). Each player is counted at most
// once per qualifying play; defensive players never appear (only offense_players
// are parsed). Deterministic.

import type { ParticipationPlay } from '@/pipeline/participation/types';

export interface PlayerCount {
  participations: number;
  seasons: Set<number>;
  games: Set<string>;
}

export interface ParticipationCounts {
  /** gsis → qualifying pass-play participations + covered seasons/games. */
  readonly byPlayer: Map<string, PlayerCount>;
  /** `${team}|${season}` → qualifying dropbacks (team denominator). */
  readonly teamDropbacks: Map<string, number>;
}

export function countParticipation(
  plays: readonly ParticipationPlay[],
  asOfSeason: number,
): ParticipationCounts {
  const byPlayer = new Map<string, PlayerCount>();
  const teamDropbacks = new Map<string, number>();

  for (const play of plays) {
    if (!play.isDropback) continue;
    if (play.season > asOfSeason) continue; // only up to the as-of season

    if (play.offenseTeam) {
      const key = `${play.offenseTeam}|${play.season}`;
      teamDropbacks.set(key, (teamDropbacks.get(key) ?? 0) + 1);
    }

    // Dedup within play already done by the adapter; count each id once.
    for (const gsis of play.offensePlayers) {
      let pc = byPlayer.get(gsis);
      if (!pc) {
        pc = { participations: 0, seasons: new Set(), games: new Set() };
        byPlayer.set(gsis, pc);
      }
      pc.participations += 1;
      pc.seasons.add(play.season);
      pc.games.add(play.gameId);
    }
  }

  return { byPlayer, teamDropbacks };
}
