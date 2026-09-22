// QB role evidence, and the scoping that keeps a wider career window from becoming a wider board.
//
// Before this wire existed, `role_status` and `depth_chart_status` had no producer at all, so
// every quarterback in the league fell to the ENUM neutral — BACKUP. Role Security carries 21%
// of the dynasty composite, so an established starter and a third-stringer scored identically
// on a fifth of the model.

import { describe, expect, it } from 'vitest';
import { ingest, buildNormalizedInferenceInput, type ProviderSource } from './buildInput';
import { nflverseAdapter } from './adapters/nflverse';
import { freshness } from './__fixtures';
import { classifyQBRoleStatus } from '@/inference/roles/roles';

const AS_OF = '2026-02-01T00:00:00.000Z';

/** One weekly stat row plus the schedule row that makes it a startable team game. */
function weeks(gsis: string, season: number, count: number, over: Record<string, unknown> = {}) {
  return Array.from({ length: count }, (_, i) => ({
    player_id: gsis, season, week: i + 1, season_type: 'REG', recent_team: 'BUF',
    attempts: 30, completions: 20, passing_yards: 240, passing_tds: 2, passing_interceptions: 1,
    sacks_suffered: 2, carries: 4, rushing_yards: 20, rushing_tds: 0, ...over,
  }));
}

function build(rows: readonly Record<string, unknown>[], seasons?: readonly number[]) {
  const source: ProviderSource = {
    adapter: nflverseAdapter,
    freshness: freshness('nflverse'),
    payloads: {
      identity: [{ gsis_id: '00-QB', player_name: 'Test Passer', position: 'QB', team: 'BUF', age: 28, seasons: 8, draft_round: 1, status: 'ACTIVE' }],
      games: rows,
    },
  };
  const { snapshot } = ingest([source]);
  const canonicalId = snapshot.players.find((p) => p.providerIds.gsis === '00-QB')!.canonicalId!;
  const input = buildNormalizedInferenceInput(snapshot, {
    canonicalId, position: 'QB', asOf: AS_OF, engineVersion: 'qb-mvp-1.0',
    ...(seasons ? { valuationSeasons: seasons } : {}),
  })!;
  return { snapshot, input };
}

describe('career evidence spans the career, not the valuation window', () => {
  it('QB career facts read every ingested season', () => {
    const { input } = build([...weeks('00-QB', 2019, 16), ...weeks('00-QB', 2025, 16)], [2025]);
    // 32 games of 30 attempts — the 2019 season is career evidence even though the player is
    // valued on 2025.
    expect(input.facts.career_pass_attempts).toBe(32 * 30);
    expect(input.facts.career_adjusted_yards_per_attempt).toBeCloseTo((240 + 20 * 2 - 45 * 1) / 30, 10);
  });

  it('but RECENT-FORM facts stay inside the recent window', () => {
    const { input } = build([...weeks('00-QB', 2019, 16), ...weeks('00-QB', 2025, 16)], [2025]);
    // The engine bounds `recent_games` to eight; a wider career must not widen it.
    expect(input.facts.recent_games).toBe(8);
    expect(input.facts.recent_pass_attempts).toBe(8 * 30);
  });

  it('a NON-QB position stays scoped to the valuation seasons', () => {
    // Giving the quarterback a real career and re-basing the other models on a wider window
    // are two different decisions; only the first is taken.
    const source: ProviderSource = {
      adapter: nflverseAdapter,
      freshness: freshness('nflverse'),
      payloads: {
        identity: [{ gsis_id: '00-TE', player_name: 'Test End', position: 'TE', team: 'BUF', age: 28, seasons: 8, draft_round: 2, status: 'ACTIVE' }],
        games: [
          ...Array.from({ length: 16 }, (_, i) => ({ player_id: '00-TE', season: 2019, week: i + 1, season_type: 'REG', recent_team: 'BUF', targets: 5, receptions: 4, receiving_yards: 50 })),
          ...Array.from({ length: 16 }, (_, i) => ({ player_id: '00-TE', season: 2025, week: i + 1, season_type: 'REG', recent_team: 'BUF', targets: 5, receptions: 4, receiving_yards: 50 })),
        ],
      },
    };
    const { snapshot } = ingest([source]);
    const id = snapshot.players.find((p) => p.providerIds.gsis === '00-TE')!.canonicalId!;
    const scoped = buildNormalizedInferenceInput(snapshot, { canonicalId: id, position: 'TE', asOf: AS_OF, engineVersion: 'te-mvp-1.0', valuationSeasons: [2025] })!;
    expect(scoped.facts.career_targets).toBe(16 * 5); // 2025 only
  });
});

// ---------------------------------------------------------------------------
// THE DEPTH CHART IS A QUESTION ABOUT NOW.
//
// `depth_chart_status` used to be derived from the share of a quarterback's newest SEVENTEEN
// appearances that were starts. For a part-time quarterback seventeen appearances reach back
// two or three seasons, so the field reported the job he used to have. Measured on a
// production-scale board, Anthony Richardson had started 1 of his last 8 appearances and still
// read STARTER; Teddy Bridgewater (3 of 8), Joshua Dobbs (3 of 8) and Brandon Allen (2 of 8)
// read the same way.
//
// And the ladder had no rung for a current starter without credentials, so 28 of 81
// quarterbacks read depth chart STARTER and role BACKUP at the same time.
// ---------------------------------------------------------------------------

/** Schedule rows naming the starting quarterback for each game — the provider's own fact. */
function startRows(season: number, count: number, starterGsis: (week: number) => string) {
  return Array.from({ length: count }, (_, i) => ({
    game_id: `${season}_${String(i + 1).padStart(2, '0')}_BUF_NYJ`,
    season, week: i + 1, game_type: 'REG', gameday: `${season}-09-${String(10 + i).padStart(2, '0')}`,
    home_team: 'BUF', away_team: 'NYJ', home_qb_id: starterGsis(i + 1), away_qb_id: '00-OTHER',
  }));
}

/** Weekly stat rows carrying the same game ids, so stats and starts join. */
function weeksWithIds(season: number, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    player_id: '00-QB', season, week: i + 1, season_type: 'REG', recent_team: 'BUF',
    game_id: `${season}_${String(i + 1).padStart(2, '0')}_BUF_NYJ`,
    attempts: 30, completions: 20, passing_yards: 240, passing_tds: 2, passing_interceptions: 1,
    sacks_suffered: 2, carries: 4, rushing_yards: 20, rushing_tds: 0,
  }));
}

function roleFor(args: {
  readonly games: readonly Record<string, unknown>[];
  readonly starts: readonly Record<string, unknown>[];
  readonly asOf?: string;
  readonly seasons?: number;
}) {
  const source: ProviderSource = {
    adapter: nflverseAdapter,
    freshness: freshness('nflverse'),
    payloads: {
      identity: [{ gsis_id: '00-QB', player_name: 'Test Passer', position: 'QB', team: 'BUF', age: 30, seasons: args.seasons ?? 10, draft_round: 1, status: 'ACTIVE' }],
      games: args.games,
      schedule: args.starts,
      officialStarts: args.starts,
    },
  };
  const { snapshot } = ingest([source]);
  const canonicalId = snapshot.players.find((p) => p.providerIds.gsis === '00-QB')!.canonicalId!;
  const input = buildNormalizedInferenceInput(snapshot, {
    canonicalId, position: 'QB', asOf: args.asOf ?? AS_OF, engineVersion: 'qb-mvp-1.0',
  })!;
  const signals = input.evidence.qbRole;
  // A quarterback the provider never named as a starter produces NO role evidence at all, and
  // both fields then fall to their ENUM neutral — which is BACKUP, and is the right answer for
  // him. Reported here as the same pair so a caller sees one shape.
  if (!signals) return { signals: null, depth: 'BACKUP' as const, role: 'BACKUP' as const };
  return { signals, depth: signals.depthChartStatus, role: classifyQBRoleStatus(signals) };
}

describe('depth_chart_status reads the CURRENT window, not a two-season average', () => {
  it('a quarterback who lost the job reads BACKUP, despite a long starting history', () => {
    // 17 appearances: he started the first 12 and none of the last 5. Over the old
    // seventeen-appearance window that is 12/17 = 0.71, comfortably past the 0.5 cut, so he
    // read STARTER. Over the engine's own eight-game recent window it is 3/8 = 0.375.
    const { depth, role } = roleFor({
      games: weeksWithIds(2025, 17),
      starts: startRows(2025, 17, (w) => (w <= 12 ? '00-QB' : '00-BACKUP')),
    });
    expect(depth).toBe('BACKUP');
    expect(role).toBe('BACKUP');
  });

  it('a quarterback who just won the job reads STARTER, despite a backup history', () => {
    // The mirror image, and the case the old window got wrong in the other direction: none of
    // his first 9 appearances were starts and all of his last 8 were. Seventeen-appearance
    // rate 8/17 = 0.47 → BACKUP under the old reading. Current window 8/8 = 1.0.
    const { depth, role } = roleFor({
      games: weeksWithIds(2025, 17),
      starts: startRows(2025, 17, (w) => (w <= 9 ? '00-BACKUP' : '00-QB')),
    });
    expect(depth).toBe('STARTER');
    // 8 career starts is far short of the 48 the established rung needs, and 10 seasons rules
    // out the young rung — exactly the fall-through the ladder used to call a BACKUP while its
    // own depth chart said STARTER.
    expect(role).toBe('BRIDGE_STARTER');
  });

  it('an established starter still reaches ESTABLISHED_STARTER', () => {
    const { depth, role } = roleFor({
      games: [...weeksWithIds(2023, 17), ...weeksWithIds(2024, 17), ...weeksWithIds(2025, 17)],
      starts: [...startRows(2023, 17, () => '00-QB'), ...startRows(2024, 17, () => '00-QB'), ...startRows(2025, 17, () => '00-QB')],
    });
    expect(depth).toBe('STARTER');
    expect(role).toBe('ESTABLISHED_STARTER');
  });

  it('a young current starter reaches YOUNG_COMMITTED_STARTER on its own credentials', () => {
    const { role } = roleFor({
      games: [...weeksWithIds(2024, 17), ...weeksWithIds(2025, 17)],
      starts: [...startRows(2024, 17, () => '00-QB'), ...startRows(2025, 17, () => '00-QB')],
      seasons: 2,
    });
    expect(role).toBe('YOUNG_COMMITTED_STARTER');
  });

  it('a true backup is still a backup at both fields', () => {
    const r = roleFor({
      games: weeksWithIds(2025, 17),
      starts: startRows(2025, 17, () => '00-SOMEONE-ELSE'),
    });
    // He appeared in 17 games and started none of them, so no start record names him and no
    // role evidence is built. Both fields land on the ENUM neutral, which is BACKUP — the
    // correct answer, reached by absence of evidence rather than by a rung.
    expect(r.signals).toBeNull();
    expect(r.depth).toBe('BACKUP');
    expect(r.role).toBe('BACKUP');
  });

  it('the two fields never contradict each other', () => {
    // The population-level invariant, at the seam that produces both. Whatever the start
    // pattern, a STARTER depth chart may not come back as a BACKUP role.
    for (const cut of [0, 3, 5, 9, 12, 17]) {
      const { depth, role } = roleFor({
        games: weeksWithIds(2025, 17),
        starts: startRows(2025, 17, (w) => (w <= cut ? '00-QB' : '00-BACKUP')),
      });
      if (depth === 'STARTER') expect(role, `cut=${cut}`).not.toBe('BACKUP');
      expect(['STARTER', 'BACKUP']).toContain(depth);
    }
  });

  it('POINT IN TIME: an older as-of sees the role that was true then', () => {
    // The same player and the same captures, two as-of instants. He started weeks 1-12 and lost
    // the job from week 13. Nothing about the current role may leak backwards into a replay of
    // the earlier board — every game is filtered by `withinAsOf` before any window is taken.
    const games = weeksWithIds(2025, 17);
    const starts = startRows(2025, 17, (w) => (w <= 12 ? '00-QB' : '00-BACKUP'));
    const during = roleFor({ games, starts, asOf: '2025-11-20T00:00:00.000Z' });
    const after = roleFor({ games, starts, asOf: AS_OF });
    expect(during.depth).toBe('STARTER');
    expect(after.depth).toBe('BACKUP');
    // The earlier as-of can only have seen a subset of the starts the later one sees.
    expect(during.signals?.careerStarts ?? 0).toBeLessThanOrEqual(after.signals?.careerStarts ?? 0);
  });
});
