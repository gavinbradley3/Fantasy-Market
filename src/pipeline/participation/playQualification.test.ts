import { describe, expect, it } from 'vitest';
import { qualifyPlay } from '@/pipeline/participation/playQualification';
import type { ParticipationPlayRaw } from '@/pipeline/participation/nflverse/participationSchema';

function play(over: Partial<ParticipationPlayRaw>): ParticipationPlayRaw {
  return { game_id: 'g', play_id: '1', season: 2023, week: 1, ...over } as ParticipationPlayRaw;
}

describe('play qualification (dropback registry)', () => {
  it('counts pass attempts (complete/incomplete/INT) as dropbacks', () => {
    expect(qualifyPlay(play({ play_type: 'pass', pass: 1 })).isDropback).toBe(true);
  });

  it('counts sacks and scrambles as dropbacks', () => {
    expect(qualifyPlay(play({ sack: 1 })).isDropback).toBe(true);
    expect(qualifyPlay(play({ qb_scramble: 1 })).isDropback).toBe(true);
  });

  it('excludes designed runs', () => {
    expect(qualifyPlay(play({ play_type: 'run', rush: 1 })).isDropback).toBe(false);
  });

  it('excludes spikes, kneels, two-point attempts, and nullified plays', () => {
    expect(qualifyPlay(play({ play_type: 'qb_spike', qb_spike: 1, pass: 1 })).isDropback).toBe(false);
    expect(qualifyPlay(play({ play_type: 'qb_kneel', qb_kneel: 1 })).isDropback).toBe(false);
    expect(qualifyPlay(play({ pass: 1, two_point_attempt: 1 })).isDropback).toBe(false);
    expect(qualifyPlay(play({ play_type: 'no_play', pass: 1, penalty: 1 })).isDropback).toBe(false);
  });
});
