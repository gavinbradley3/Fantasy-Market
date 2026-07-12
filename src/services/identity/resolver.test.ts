import { describe, expect, it } from 'vitest';
import { buildDirectory, type ResolverInput } from '@/services/identity/resolver';
import { FIXED_NOW_ISO, nflverseRecord, sleeperRecord } from '@/services/identity/testutil';
import type { PlayerSourceIdMap } from '@/services/identity/types';

const base = (over: Partial<ResolverInput> = {}): ResolverInput => ({
  sleeper: [],
  nflverse: [],
  priorMappings: [],
  manualMappings: [],
  generatedAt: FIXED_NOW_ISO,
  effectiveSeason: 2025,
  ...over,
});

const priorMap = (
  playerTickerId: string,
  source: 'SLEEPER' | 'NFLVERSE',
  sourcePlayerId: string,
): PlayerSourceIdMap => ({
  playerTickerId,
  source,
  sourcePlayerId,
  matchMethod: 'GSIS_ID',
  confidence: 'EXACT',
  validFrom: '2025-01-01T00:00:00.000Z',
  validTo: null,
});

describe('match order', () => {
  it('rule 1 — an existing mapping wins over everything and keeps the id', () => {
    const out = buildDirectory(
      base({
        sleeper: [sleeperRecord({ sleeperId: '10', fullName: 'Kept Player', team: 'DET' })],
        nflverse: [
          nflverseRecord({ gsisId: '00-1', fullName: 'Kept Player', team: 'DET', sleeperId: '10' }),
        ],
        priorMappings: [priorMap('ptp_gsis_00-1', 'SLEEPER', '10'), priorMap('ptp_gsis_00-1', 'NFLVERSE', '00-1')],
      }),
    );
    const outcome = out.outcomes.get('10');
    expect(outcome).toEqual({ status: 'MATCHED', playerTickerId: 'ptp_gsis_00-1', method: 'EXISTING_MAPPING' });
    // The pair reconnects — one merged identity, not two singletons.
    expect(out.players).toHaveLength(1);
    expect(out.players[0].provenance.sources).toEqual(['SLEEPER', 'NFLVERSE']);
    // validFrom is preserved from the original mapping, not reset.
    expect(out.sourceIdMaps.every((m) => m.validFrom === '2025-01-01T00:00:00.000Z')).toBe(true);
  });

  it('rule 2 — the nflverse-published sleeper_id crosswalk pairs records', () => {
    const out = buildDirectory(
      base({
        sleeper: [sleeperRecord({ sleeperId: '20', fullName: 'Cross Walk', team: 'KC' })],
        nflverse: [nflverseRecord({ gsisId: '00-2', fullName: 'Cross Walk', team: 'KC', sleeperId: '20' })],
      }),
    );
    expect(out.outcomes.get('20')).toEqual({
      status: 'MATCHED',
      playerTickerId: 'ptp_gsis_00-2',
      method: 'DIRECT_CROSSWALK',
    });
    expect(out.review.methodCounts.DIRECT_CROSSWALK).toBe(1);
  });

  it('rule 3 — Sleeper-published gsis_id pairs records without any name help', () => {
    const out = buildDirectory(
      base({
        sleeper: [
          sleeperRecord({ sleeperId: '30', fullName: 'Totally Different Display', gsisId: '00-3' }),
        ],
        nflverse: [nflverseRecord({ gsisId: '00-3', fullName: 'Real Name', team: 'BUF' })],
      }),
    );
    expect(out.outcomes.get('30')).toMatchObject({ status: 'MATCHED', method: 'GSIS_ID' });
    // Changed display name across providers is flagged, never re-identified.
    expect(out.players[0].provenance.qualityFlags).toContain('NAME_MISMATCH');
  });

  it('rule 4 — exact name + birth date + position matches with HIGH confidence', () => {
    const out = buildDirectory(
      base({
        sleeper: [
          sleeperRecord({ sleeperId: '40', fullName: 'D.J. Moore', birthDate: '1997-04-14', team: 'CHI' }),
        ],
        nflverse: [nflverseRecord({ gsisId: '00-4', fullName: 'DJ Moore', birthDate: '1997-04-14', team: 'CHI' })],
      }),
    );
    expect(out.outcomes.get('40')).toMatchObject({ status: 'MATCHED', method: 'NAME_BIRTHDATE_POSITION' });
    const map = out.sourceIdMaps.find((m) => m.source === 'SLEEPER');
    expect(map?.confidence).toBe('HIGH');
  });

  it('rule 5 — unique name + team + position matches but is flagged REVIEW_REQUIRED', () => {
    const out = buildDirectory(
      base({
        sleeper: [sleeperRecord({ sleeperId: '50', fullName: 'Solo Match', team: 'PHI' })],
        nflverse: [nflverseRecord({ gsisId: '00-5', fullName: 'Solo Match', team: 'PHI' })],
      }),
    );
    expect(out.outcomes.get('50')).toMatchObject({ status: 'MATCHED', method: 'NAME_TEAM_POSITION' });
    expect(out.sourceIdMaps[0].confidence).toBe('REVIEW_REQUIRED');
    expect(out.review.reviewRequired).toHaveLength(1);
  });
});

describe('refusals — never guess', () => {
  it('duplicate names across teams with no stronger identifier are AMBIGUOUS', () => {
    const out = buildDirectory(
      base({
        sleeper: [sleeperRecord({ sleeperId: '60', fullName: 'Mike Williams', team: 'NYJ' })],
        nflverse: [
          nflverseRecord({ gsisId: '00-6a', fullName: 'Mike Williams', team: 'NYJ' }),
          nflverseRecord({ gsisId: '00-6b', fullName: 'Mike Williams', team: 'PIT' }),
        ],
      }),
    );
    const outcome = out.outcomes.get('60');
    expect(outcome?.status).toBe('AMBIGUOUS');
    // The ambiguous Sleeper record gets NO identity and NO mapping…
    expect(out.players.some((p) => p.sleeperId === '60')).toBe(false);
    expect(out.sourceIdMaps.some((m) => m.source === 'SLEEPER')).toBe(false);
    // …but is preserved for review with its candidates described.
    expect(out.review.ambiguous).toHaveLength(1);
    expect(out.review.ambiguous[0].candidates).toHaveLength(2);
    // Both nflverse players survive as single-source identities.
    expect(out.players).toHaveLength(2);
  });

  it('same name with different birth dates: matching one is fine, matching none refuses', () => {
    const twins = [
      nflverseRecord({ gsisId: '00-7a', fullName: 'Josh Allen', birthDate: '1996-05-21', team: 'BUF' }),
      nflverseRecord({ gsisId: '00-7b', fullName: 'Josh Allen', birthDate: '1997-07-13', team: 'JAX' }),
    ];
    const hit = buildDirectory(
      base({
        sleeper: [sleeperRecord({ sleeperId: '70', fullName: 'Josh Allen', birthDate: '1996-05-21' })],
        nflverse: twins,
      }),
    );
    expect(hit.outcomes.get('70')).toMatchObject({ status: 'MATCHED', method: 'NAME_BIRTHDATE_POSITION' });

    const miss = buildDirectory(
      base({
        sleeper: [
          sleeperRecord({ sleeperId: '71', fullName: 'Josh Allen', birthDate: '1990-01-01', team: 'BUF' }),
        ],
        nflverse: twins,
      }),
    );
    expect(miss.outcomes.get('71')?.status).toBe('AMBIGUOUS');
  });

  it('incompatible positions prevent an automatic name match', () => {
    const out = buildDirectory(
      base({
        sleeper: [sleeperRecord({ sleeperId: '80', fullName: 'Logan Thomas', position: 'QB', team: 'WAS' })],
        nflverse: [nflverseRecord({ gsisId: '00-8', fullName: 'Logan Thomas', position: 'TE', team: 'WAS' })],
      }),
    );
    expect(out.outcomes.get('80')?.status).toBe('UNMATCHED');
    // But a fantasy-positions list reconciles a legitimate dual listing.
    const reconciled = buildDirectory(
      base({
        sleeper: [
          sleeperRecord({
            sleeperId: '81',
            fullName: 'Taysom Hill',
            position: 'QB',
            fantasyPositions: ['QB', 'TE'],
            team: 'NO',
          }),
        ],
        nflverse: [nflverseRecord({ gsisId: '00-9', fullName: 'Taysom Hill', position: 'TE', team: 'NO' })],
      }),
    );
    expect(reconciled.outcomes.get('81')?.status).toBe('MATCHED');
  });

  it('a gsis id can only be claimed once — the second claim is refused', () => {
    const out = buildDirectory(
      base({
        sleeper: [
          sleeperRecord({ sleeperId: '90', fullName: 'Player A', gsisId: '00-10' }),
          sleeperRecord({ sleeperId: '91', fullName: 'Player B', gsisId: '00-10' }),
        ],
        nflverse: [nflverseRecord({ gsisId: '00-10', fullName: 'Player A', team: 'SEA' })],
      }),
    );
    expect(out.outcomes.get('90')?.status).toBe('MATCHED'); // deterministic: lower id first
    expect(out.outcomes.get('91')?.status).toBe('AMBIGUOUS');
  });

  it('name-only similarity never creates a mapping (missing team and birth date)', () => {
    const out = buildDirectory(
      base({
        sleeper: [sleeperRecord({ sleeperId: '95', fullName: 'Some Body', team: null })],
        nflverse: [nflverseRecord({ gsisId: '00-11', fullName: 'Some Body', team: 'MIA' })],
      }),
    );
    expect(out.outcomes.get('95')?.status).toBe('AMBIGUOUS');
    expect(out.outcomes.get('95')).toMatchObject({
      reason: expect.stringContaining('name-only'),
    });
  });
});

describe('id stability', () => {
  it('a traded player keeps the same id (team is never part of identity)', () => {
    const first = buildDirectory(
      base({
        sleeper: [sleeperRecord({ sleeperId: '100', fullName: 'Trade Target', team: 'TEN', gsisId: '00-12' })],
        nflverse: [nflverseRecord({ gsisId: '00-12', fullName: 'Trade Target', team: 'TEN' })],
      }),
    );
    const id = first.players[0].playerTickerId;

    const second = buildDirectory(
      base({
        sleeper: [sleeperRecord({ sleeperId: '100', fullName: 'Trade Target', team: 'PHI', gsisId: '00-12' })],
        nflverse: [nflverseRecord({ gsisId: '00-12', fullName: 'Trade Target', team: 'PHI' })],
        priorMappings: first.sourceIdMaps,
      }),
    );
    expect(second.players).toHaveLength(1);
    expect(second.players[0].playerTickerId).toBe(id);
    expect(second.players[0].team).toBe('PHI');
    expect(second.outcomes.get('100')).toMatchObject({ method: 'EXISTING_MAPPING' });
  });

  it('a free agent (null team everywhere) still resolves via stable ids', () => {
    const out = buildDirectory(
      base({
        sleeper: [sleeperRecord({ sleeperId: '110', fullName: 'Street Free Agent', team: null, gsisId: '00-13' })],
        nflverse: [nflverseRecord({ gsisId: '00-13', fullName: 'Street Free Agent', team: null })],
      }),
    );
    expect(out.outcomes.get('110')?.status).toBe('MATCHED');
    expect(out.players[0].team).toBeNull();
  });

  it('a Sleeper-only mint keeps its id when nflverse appears in a later run', () => {
    const first = buildDirectory(
      base({ sleeper: [sleeperRecord({ sleeperId: '120', fullName: 'Late Arrival', gsisId: '00-14' })] }),
    );
    const id = first.players[0].playerTickerId;
    expect(id).toBe('ptp_gsis_00-14'); // anchored to the strongest stable id

    const second = buildDirectory(
      base({
        sleeper: [sleeperRecord({ sleeperId: '120', fullName: 'Late Arrival', gsisId: '00-14' })],
        nflverse: [nflverseRecord({ gsisId: '00-14', fullName: 'Late Arrival', team: 'DEN' })],
        priorMappings: first.sourceIdMaps,
      }),
    );
    expect(second.players).toHaveLength(1);
    expect(second.players[0].playerTickerId).toBe(id);
    expect(second.players[0].provenance.sources).toEqual(['SLEEPER', 'NFLVERSE']);
  });

  it('records with no gsis anywhere anchor on the Sleeper id', () => {
    const out = buildDirectory(
      base({ sleeper: [sleeperRecord({ sleeperId: '130', fullName: 'No Gsis Yet' })] }),
    );
    expect(out.players[0].playerTickerId).toBe('ptp_slp_130');
  });
});

describe('preservation and review', () => {
  it('unmatched Sleeper records become single-source identities and stay in review', () => {
    const out = buildDirectory(
      base({ sleeper: [sleeperRecord({ sleeperId: '140', fullName: 'Sleeper Only' })] }),
    );
    expect(out.outcomes.get('140')?.status).toBe('UNMATCHED');
    expect(out.players[0].provenance.qualityFlags).toContain('SINGLE_SOURCE_SLEEPER');
    expect(out.review.unmatched.some((e) => e.source === 'SLEEPER')).toBe(true);
    expect(out.review.methodCounts.NEW_IDENTITY).toBe(1);
  });

  it('unclaimed nflverse records become single-source identities and stay in review', () => {
    const out = buildDirectory(
      base({ nflverse: [nflverseRecord({ gsisId: '00-15', fullName: 'Verse Only', team: 'CLE' })] }),
    );
    expect(out.players[0].playerTickerId).toBe('ptp_gsis_00-15');
    expect(out.players[0].provenance.qualityFlags).toContain('SINGLE_SOURCE_NFLVERSE');
    expect(out.review.unmatched.some((e) => e.source === 'NFLVERSE')).toBe(true);
  });

  it('manual mappings resolve with method MANUAL and win over prior mappings', () => {
    const out = buildDirectory(
      base({
        sleeper: [sleeperRecord({ sleeperId: '150', fullName: 'Hand Resolved' })],
        nflverse: [nflverseRecord({ gsisId: '00-16', fullName: 'Different Spelling', team: 'ATL' })],
        priorMappings: [priorMap('ptp_wrong', 'SLEEPER', '150')],
        manualMappings: [
          { playerTickerId: 'ptp_gsis_00-16', source: 'SLEEPER', sourcePlayerId: '150', note: 'verified' },
          { playerTickerId: 'ptp_gsis_00-16', source: 'NFLVERSE', sourcePlayerId: '00-16', note: 'verified' },
        ],
      }),
    );
    expect(out.outcomes.get('150')).toMatchObject({
      status: 'MATCHED',
      playerTickerId: 'ptp_gsis_00-16',
      method: 'MANUAL',
    });
    expect(out.players).toHaveLength(1);
    expect(out.players[0].provenance.sources).toContain('MANUAL');
  });

  it('cross-provider field precedence and null preservation', () => {
    const out = buildDirectory(
      base({
        sleeper: [
          sleeperRecord({
            sleeperId: '160',
            fullName: 'Merge Case',
            gsisId: '00-17',
            team: 'DAL',
            age: 27,
            injuryStatus: 'Questionable',
            depthChartOrder: 2,
          }),
        ],
        nflverse: [
          nflverseRecord({
            gsisId: '00-17',
            fullName: 'Merge Case',
            team: 'DAL',
            birthDate: '1998-02-02',
            draftRound: 3,
          }),
        ],
      }),
    );
    const p = out.players[0];
    expect(p.birthDate).toBe('1998-02-02'); // curated fact: nflverse
    expect(p.age).toBe(27); // Sleeper-only fact
    expect(p.draftRound).toBe(3);
    expect(p.injuryStatus).toBe('Questionable');
    expect(p.depthChartOrder).toBe(2);
    expect(p.yearsExperience).toBeNull(); // missing stays null — never 0
  });

  it('is deterministic regardless of provider payload ordering', () => {
    const sleeper = [
      sleeperRecord({ sleeperId: '3', fullName: 'Charlie Three', gsisId: '00-c' }),
      sleeperRecord({ sleeperId: '1', fullName: 'Alpha One', gsisId: '00-a' }),
      sleeperRecord({ sleeperId: '2', fullName: 'Bravo Two' }),
    ];
    const nflverse = [
      nflverseRecord({ gsisId: '00-c', fullName: 'Charlie Three', team: 'NYG' }),
      nflverseRecord({ gsisId: '00-a', fullName: 'Alpha One', team: 'LV' }),
    ];
    const a = buildDirectory(base({ sleeper, nflverse }));
    const b = buildDirectory(base({ sleeper: [...sleeper].reverse(), nflverse: [...nflverse].reverse() }));
    expect(a.players).toEqual(b.players);
    expect(a.sourceIdMaps).toEqual(b.sourceIdMaps);
  });
});
