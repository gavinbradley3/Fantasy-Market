import { describe, expect, it } from 'vitest';
import { parseParticipation } from '@/pipeline/participation/nflverse/participationAdapter';
import { countParticipation } from '@/pipeline/participation/count';
import { rawParticipationPayload } from '@/pipeline/test-support';

const COVERED = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023];

describe('participation adapter', () => {
  const r = parseParticipation(rawParticipationPayload(), { seasons: COVERED });

  it('parses valid plays and reports the full reject matrix without throwing', () => {
    const reasons = r.rejected.map((x) => x.reason);
    expect(reasons).toContain('DUPLICATE_PLAY');
    expect(reasons).toContain('MALFORMED_PLAYERS'); // ";;;"
    expect(reasons).toContain('UNSUPPORTED_SEASON'); // 2015
    expect(r.incompletePersonnelPlays).toBeGreaterThanOrEqual(1); // 2-id play
  });

  it('filters postseason by default', () => {
    expect(r.plays.every((p) => p.seasonType === 'REG')).toBe(true);
  });

  it('dedups duplicate GSIS within a single play', () => {
    const dupPlay = r.plays.find((p) => p.gameId === '2023_03_CIN');
    const chaseCount = dupPlay?.offensePlayers.filter((id) => id === '00-0036900').length;
    expect(chaseCount).toBe(1);
  });

  it('is order-independent (shuffled plays → identical output)', () => {
    const raw = rawParticipationPayload() as unknown[];
    const a = parseParticipation(raw, { seasons: COVERED });
    const b = parseParticipation([...raw].reverse(), { seasons: COVERED });
    expect(JSON.stringify(a.plays)).toBe(JSON.stringify(b.plays));
  });

  it('handles non-array payloads', () => {
    expect(parseParticipation({ x: 1 }, {}).rejected[0].reason).toBe('MALFORMED');
  });
});

describe('participation counting', () => {
  it('counts each player at most once per qualifying dropback; excludes non-dropbacks', () => {
    const { plays } = parseParticipation(rawParticipationPayload(), { seasons: COVERED });
    const counts = countParticipation(plays, 2023);
    const chase = counts.byPlayer.get('00-0036900');
    // 2021 wk1 pass, 2021 wk2 sack, 2022 scramble, 2023 wk1, wk2, wk3, wk4 pass = 7 dropbacks.
    expect(chase?.participations).toBe(7);
    expect([...chase!.seasons].sort()).toEqual([2021, 2022, 2023]);
    // Team dropbacks accumulate the same qualifying plays.
    expect((counts.teamDropbacks.get('CIN|2023') ?? 0)).toBeGreaterThan(0);
  });

  it('respects the as-of season cutoff', () => {
    const { plays } = parseParticipation(rawParticipationPayload(), { seasons: COVERED });
    const upTo2021 = countParticipation(plays, 2021);
    expect([...upTo2021.byPlayer.get('00-0036900')!.seasons]).toEqual([2021]);
  });
});
