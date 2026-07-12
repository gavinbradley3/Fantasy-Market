// Regression guard for the Phase 1 identity ⇄ four-position integration:
// proves the identity layer and the WR/RB/TE/QB application baseline coexist.
// Uses only stable public surfaces (position registry, engine entry point,
// identity schema/resolver/directory) — no UI internals.

import { describe, expect, it } from 'vitest';
import { evaluateQuarterback } from '@/qb-model';
import { POSITION_MODULES, SUPPORTED_POSITIONS } from '@/pages/player-model/registry';
import type { SupportedPosition } from '@/pages/player-model/types';
import { PlayerIdentityDirectory } from '@/services/identity/directory';
import { normalizePosition } from '@/services/identity/normalize';
import { buildDirectory } from '@/services/identity/resolver';
import { canonicalPlayerIdentitySchema } from '@/services/identity/schemas';
import { FIXED_NOW_ISO, nflverseRecord, sleeperRecord } from '@/services/identity/testutil';
import type { Position } from '@/types/market';

// Compile-time proof that the identity layer's position union and the shared
// UI's SupportedPosition are the same type — if either drifts, this fails to
// typecheck rather than silently diverging.
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const positionsAligned: MutuallyAssignable<Position, SupportedPosition> = true;

describe('four-position + identity coexistence', () => {
  it('the application supports exactly WR, RB, TE, and QB', () => {
    expect(positionsAligned).toBe(true);
    expect([...SUPPORTED_POSITIONS].sort()).toEqual(['QB', 'RB', 'TE', 'WR']);
    for (const pos of SUPPORTED_POSITIONS) {
      const module = POSITION_MODULES[pos];
      expect(module.position).toBe(pos);
      expect(module.primary.length).toBeGreaterThan(0);
    }
  });

  it('identity infrastructure did not remove the QB registry or evaluator', () => {
    expect(typeof evaluateQuarterback).toBe('function');
    expect(POSITION_MODULES.QB.primary.length).toBeGreaterThan(0);
  });

  it('identity normalization accepts every supported position', () => {
    for (const pos of SUPPORTED_POSITIONS) {
      expect(normalizePosition(pos)).toBe(pos);
    }
  });

  it('the identity schema accepts a QB record', () => {
    const parsed = canonicalPlayerIdentitySchema.safeParse({
      playerTickerId: 'ptp_gsis_00-qb',
      sleeperId: '4046',
      gsisId: '00-qb',
      fullName: 'Test Quarterback',
      firstName: null,
      lastName: null,
      birthDate: '1995-11-17',
      age: 30,
      position: 'QB',
      team: 'BUF',
      yearsExperience: 8,
      draftRound: 1,
      rosterStatus: 'Active',
      injuryStatus: null,
      practiceStatus: null,
      depthChartOrder: 1,
      provenance: { sources: ['SLEEPER', 'NFLVERSE'], collectedAt: FIXED_NOW_ISO, effectiveSeason: 2025, qualityFlags: [] },
    });
    expect(parsed.success).toBe(true);
  });

  it('a QB identity normalizes, resolves cross-provider, and is served by the directory', () => {
    const resolved = buildDirectory({
      sleeper: [
        sleeperRecord({ sleeperId: '4046', fullName: 'Test Quarterback', position: 'QB', team: 'BUF', gsisId: '00-qb' }),
      ],
      nflverse: [nflverseRecord({ gsisId: '00-qb', fullName: 'Test Quarterback', position: 'QB', team: 'BUF' })],
      priorMappings: [],
      manualMappings: [],
      generatedAt: FIXED_NOW_ISO,
      effectiveSeason: 2025,
    });
    expect(resolved.outcomes.get('4046')).toMatchObject({ status: 'MATCHED', method: 'GSIS_ID' });
    expect(resolved.players[0].position).toBe('QB');

    const empty = PlayerIdentityDirectory.empty();
    const dir = new PlayerIdentityDirectory({
      ...empty.snapshot,
      players: resolved.players,
      sourceIdMaps: resolved.sourceIdMaps,
      review: resolved.review,
    });
    // The directory must not filter QBs out.
    expect(dir.listPlayers('QB')).toHaveLength(1);
    expect(dir.getBySleeperId('4046')?.position).toBe('QB');
  });
});
