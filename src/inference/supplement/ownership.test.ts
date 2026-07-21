import { describe, expect, it } from 'vitest';
import { fieldSource } from '@/inference/supplement/ownership';

describe('field ownership (REGISTRY §13.3)', () => {
  it('classifies metadata keys', () => {
    expect(fieldSource('WR', 'player_id')).toBe('metadata');
    expect(fieldSource('QB', 'injury_status')).toBe('metadata');
  });

  it('classifies stats-stage fields as facts', () => {
    expect(fieldSource('WR', 'target_share')).toBe('facts');
    expect(fieldSource('RB', 'carry_share_last4')).toBe('facts');
    expect(fieldSource('QB', 'career_pass_attempts')).toBe('facts');
  });

  it('classifies projections/context-stage fields as ail', () => {
    expect(fieldSource('WR', 'projected_team_dropbacks')).toBe('ail');
    expect(fieldSource('WR', 'qb_environment_score')).toBe('ail');
    expect(fieldSource('WR', 'competition_pressure')).toBe('ail');
    expect(fieldSource('QB', 'offensive_environment_score')).toBe('ail');
  });

  it('leaves TE route-participation windows engine-owned (REGISTRY §7.4)', () => {
    expect(fieldSource('TE', 'route_participation_last4')).toBe('engine');
    expect(fieldSource('TE', 'route_participation_last8')).toBe('engine');
  });
});
