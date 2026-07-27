// Source-plan and selection tests. Both are pure, so they are asserted directly rather
// than inferred from a pipeline run.

import { describe, expect, it } from 'vitest';
import { buildSourcePlan, REQUIRED_PROVIDERS } from './sources';
import { selectInferenceBuilds, DEFAULT_ENGINE_VERSIONS } from './selection';
import type { NormalizedSnapshot } from '@/ingestion';

const EFFECTIVE = '2026-02-15T00:00:00.000Z';

describe('source plan', () => {
  const plan = (seasons: number[], mode: 'live' | 'replay' = 'live') =>
    buildSourcePlan({ seasons, effectiveDate: EFFECTIVE, mode });

  it('acquires the season-independent datasets once and the seasonal ones per season', () => {
    const coords = plan([2024, 2025]).map((s) => `${s.capability}:${s.params?.season ?? '-'}`);
    expect(coords).toEqual([
      'games:2024',
      'games:2025',
      'identity:-',
      'participation:2024',
      'participation:2025',
      'roster:2024',
      'roster:2025',
      'schedule:-',
    ]);
  });

  it('never requests officialStarts directly — it rides along with the schedule', () => {
    expect(plan([2025]).some((s) => s.capability === 'officialStarts')).toBe(false);
  });

  it('de-duplicates a repeated season, which the orchestrator would otherwise reject', () => {
    expect(plan([2025, 2025, 2024])).toEqual(plan([2024, 2025]));
  });

  it('is canonically ordered and independent of the input season order', () => {
    expect(plan([2025, 2023, 2024])).toEqual(plan([2023, 2024, 2025]));
  });

  it('differs between live and replay ONLY in mode and conditional revalidation', () => {
    // This is what makes a replay the same run rather than a similar one.
    const live = plan([2025], 'live');
    const replay = plan([2025], 'replay');
    expect(replay.map((s) => ({ ...s, mode: 'live' as const, conditional: true }))).toEqual(live);
    expect(replay.every((s) => s.mode === 'replay')).toBe(true);
  });

  it('adds Sleeper only when asked', () => {
    expect(plan([2025]).some((s) => s.provider === 'sleeper')).toBe(false);
    const withSleeper = buildSourcePlan({ seasons: [2025], effectiveDate: EFFECTIVE, mode: 'live', includeSleeper: true });
    expect(withSleeper.some((s) => s.provider === 'sleeper')).toBe(true);
  });

  it('refuses to build a plan with no season', () => {
    expect(() => buildSourcePlan({ seasons: [], effectiveDate: EFFECTIVE, mode: 'live' })).toThrow(/at least one season/);
  });

  it('treats nflverse as required', () => {
    expect(REQUIRED_PROVIDERS).toEqual(['nflverse']);
  });
});

// A snapshot carrying only the fields selection reads.
function snapshotOf(
  players: { canonicalId: string; position: string | null }[],
  games: { canonicalId: string; kickoff: string; seasonType?: 'REG' | 'POST' }[],
): NormalizedSnapshot {
  return {
    players: players.map((p) => ({ ...p, providerIds: {} })),
    games: games.map((g) => ({ seasonType: 'REG' as const, ...g })),
    rosters: [], schedule: [], participation: [], injuries: [], transactions: [],
    officialStarts: [], depthCharts: [], snapshotId: 'snap-x', providersUsed: [], identityIndex: {},
  } as unknown as NormalizedSnapshot;
}

describe('inference selection', () => {
  const ASOF = '2025-12-01T00:00:00.000Z';
  const select = (s: NormalizedSnapshot) => selectInferenceBuilds(s, { asOf: ASOF });

  it('selects a modelled player who has regular-season game evidence', () => {
    const builds = select(snapshotOf(
      [{ canonicalId: 'pt-a', position: 'WR' }],
      [{ canonicalId: 'pt-a', kickoff: '2025-10-01T00:00:00.000Z' }],
    ));
    expect(builds).toEqual([{ canonicalId: 'pt-a', position: 'WR', asOf: ASOF, engineVersion: DEFAULT_ENGINE_VERSIONS.WR }]);
  });

  it('excludes an unmodelled position', () => {
    // The identity export carries every position; only the four modelled ones are valued.
    const builds = select(snapshotOf(
      [{ canonicalId: 'pt-k', position: 'K' }, { canonicalId: 'pt-n', position: null }],
      [{ canonicalId: 'pt-k', kickoff: '2025-10-01T00:00:00.000Z' }, { canonicalId: 'pt-n', kickoff: '2025-10-01T00:00:00.000Z' }],
    ));
    expect(builds).toEqual([]);
  });

  it('excludes a player with no game evidence in the ingested seasons', () => {
    expect(select(snapshotOf([{ canonicalId: 'pt-a', position: 'RB' }], []))).toEqual([]);
  });

  it('does not count a future game or a postseason game as evidence', () => {
    // Future games would leak across the as-of boundary; postseason is excluded by §20.F11.
    const future = select(snapshotOf(
      [{ canonicalId: 'pt-a', position: 'TE' }],
      [{ canonicalId: 'pt-a', kickoff: '2026-01-01T00:00:00.000Z' }],
    ));
    const post = select(snapshotOf(
      [{ canonicalId: 'pt-b', position: 'TE' }],
      [{ canonicalId: 'pt-b', kickoff: '2025-10-01T00:00:00.000Z', seasonType: 'POST' }],
    ));
    expect(future).toEqual([]);
    expect(post).toEqual([]);
  });

  it('is order-independent and emits canonical id order', () => {
    const players = [
      { canonicalId: 'pt-c', position: 'QB' },
      { canonicalId: 'pt-a', position: 'WR' },
      { canonicalId: 'pt-b', position: 'RB' },
    ];
    const games = players.map((p) => ({ canonicalId: p.canonicalId, kickoff: '2025-10-01T00:00:00.000Z' }));
    const forward = select(snapshotOf(players, games));
    const reversed = select(snapshotOf([...players].reverse(), [...games].reverse()));
    expect(forward.map((b) => b.canonicalId)).toEqual(['pt-a', 'pt-b', 'pt-c']);
    expect(reversed).toEqual(forward);
  });

  it('tags each build with its position engine version', () => {
    const builds = select(snapshotOf(
      [{ canonicalId: 'pt-a', position: 'QB' }],
      [{ canonicalId: 'pt-a', kickoff: '2025-10-01T00:00:00.000Z' }],
    ));
    expect(builds[0].engineVersion).toBe(DEFAULT_ENGINE_VERSIONS.QB);
  });
});
