import { describe, expect, it } from 'vitest';
import { buildBetaReferenceLedger, type BetaReferenceInput, type BetaReferenceTable } from './betaReferences';

const AS_OF = '2026-09-22T03:16:45.636Z';
const CAPTURED = '2026-09-22T03:00:00.000Z';
const GAME = '2026_01_BUF_NYJ';
const table = (id: string, rows: BetaReferenceTable['rows']): BetaReferenceTable => ({
  source: { id, checksum: 'a'.repeat(64), capturedAt: CAPTURED }, rows,
});
function fixture(): BetaReferenceInput {
  return { asOf: AS_OF, valuationSeasons: [2026],
    schedule: table('schedule', [{ game_id: GAME, game_type: 'REG', season: '2026', week: '1',
      home_team: 'NYJ', away_team: 'BUF', gameday: '2026-09-13', gametime: '13:00',
      away_score: '30', home_score: '10', away_qb_id: '00-001', home_qb_id: '00-002' }]),
    playByPlay: table('pbp', [{ game_id: GAME, play_type_nfl: 'END_GAME', home_team: 'NYJ', away_team: 'BUF',
      start_time: '9/13/26, 13:05:43', time_of_day: '', end_clock_time: '0:00' }]),
    roster: table('roster', [{ gsis_id: '00-001', team: 'BUF', season: '2026', week: '1', game_type: 'REG',
      status: 'ACT', status_description_abbr: 'A01', position: 'QB' }]),
    games: [table('games-2026', [{ player_id: '00-001', season: '2026', season_type: 'REG', week: '1',
      team: 'BUF', opponent_team: 'NYJ', carries: '0', targets: '0', passing_yards: '280', receiving_yards: '' }])],
    identities: [{ gsisId: '00-001', canonicalId: 'player-one' }],
  };
}

describe('controlled-beta source-backed reference ledger', () => {
  it('uses affirmative final proof known by capture without inventing an ending timestamp', () => {
    const input = fixture(); const before = JSON.stringify(input);
    const result = buildBetaReferenceLedger(input);
    expect(result.inputIntegrity).toBe(true);
    expect(result.games[0]).toMatchObject({ gameId: GAME, state: 'FINAL_KNOWN_BY', finalKnownBy: CAPTURED,
      actualStartedAt: '2026-09-13T17:05:43.000Z', completedAt: null,
      finalProof: [{ sourceId: 'pbp', row: 0, knownAt: CAPTURED }] });
    expect(result.capabilities.finalStatusKnownBy).toEqual({ confirmed: 1, unconfirmedPastScheduled: 0 });
    expect(result.numericalEligibilityAuthorized).toBe(false);
    expect(result.productionPublicationAuthorized).toBe(false);
    expect(JSON.stringify(input)).toBe(before);
    expect(buildBetaReferenceLedger(input)).toEqual(result);
  });

  it('never treats schedule dates, scores, player stats or QB starter IDs as completion proof', () => {
    const input = fixture(); input.playByPlay = table('pbp', []);
    const result = buildBetaReferenceLedger(input);
    expect(result.games[0]).toMatchObject({ state: 'COMPLETION_UNCONFIRMED', finalKnownBy: null, finalProof: [], actualStartedAt: null });
    expect(result.capabilities.finalStatusKnownBy).toEqual({ confirmed: 0, unconfirmedPastScheduled: 1 });
    expect(result.historicalUsage).toHaveLength(1);
  });

  it.each(['POSTPONED', 'CANCELLED'])('does not count an explicit %s event as final and flags contradictory final proof', (status) => {
    const input = fixture(); input.schedule = table('schedule', [{ ...input.schedule.rows[0], status }]);
    input.playByPlay = table('pbp', []);
    expect(buildBetaReferenceLedger(input).games[0].state).toBe(status);
    input.playByPlay = fixture().playByPlay;
    const conflict = buildBetaReferenceLedger(input);
    expect(conflict.games[0].finalKnownBy).toBeNull();
    expect(conflict.issues.map((i) => i.code)).toContain('GAME_FINAL_STATUS_CONFLICT');
  });

  it('can establish final-known-by without an actual kickoff field, never as strict v2 eligibility', () => {
    const input = fixture(); input.playByPlay = table('pbp', [{ game_id: GAME, play_type_nfl: 'END_GAME' }]);
    expect(buildBetaReferenceLedger(input).games[0]).toMatchObject({ state: 'FINAL_KNOWN_BY', completedAt: null, actualStartedAt: null });
  });

  it('preserves missing status, raw unknown status and teamless observations without ACTIVE or release defaults', () => {
    const input = fixture(); input.roster = table('roster', ['', 'CUSTOM', 'IR'].map((status, index) => ({
      ...input.roster.rows[0], gsis_id: `00-00${index + 1}`, status, team: index === 2 ? '' : 'BUF',
    })));
    const result = buildBetaReferenceLedger(input);
    expect(result.memberships.map((m) => [m.rawStatus, m.statusEvidence])).toEqual([
      [null, 'MISSING_RAW_STATUS'], ['CUSTOM', 'EXPLICIT_RAW_STATUS'], ['IR', 'EXPLICIT_RAW_STATUS'],
    ]);
    expect(result.memberships[2].team).toBeNull();
    expect(result.roleAttestations).toEqual([]);
    expect(result.availabilityAttestations).toEqual([]);
  });

  it('does not bridge two weekly roster observations into tenure, or reinterpret ACT as role support', () => {
    const input = fixture(); input.roster = table('roster', [input.roster.rows[0], { ...input.roster.rows[0], week: '2' }]);
    const result = buildBetaReferenceLedger(input);
    expect(result.memberships).toHaveLength(2);
    expect(result.membershipIntervals).toEqual([]);
    expect(result.capabilities.continuousMembership).toBe(false);
    expect(result.missingCapabilities).toContain('CONTINUOUS_TEAM_MEMBERSHIP_NOT_ESTABLISHED');
    expect(result.numericalEligibilityAuthorized).toBe(false);
  });

  it('retains conflicting team snapshots with an integrity issue, not a fabricated trade date', () => {
    const input = fixture(); input.roster = table('roster', [input.roster.rows[0], { ...input.roster.rows[0], team: 'NYJ' }]);
    const result = buildBetaReferenceLedger(input);
    expect(result.memberships.map((m) => m.team)).toEqual(['BUF', 'NYJ']);
    expect(result.inputIntegrity).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain('ROSTER_TEAM_CONFLICT');
    expect(result.membershipIntervals).toEqual([]);
  });

  it('preserves observed zero separately from missing counts and links historical game coordinates', () => {
    const result = buildBetaReferenceLedger(fixture());
    expect(result.historicalUsage[0]).toMatchObject({ gameId: GAME, canonicalId: 'player-one', carries: 0, targets: 0,
      receptions: null, receivingYards: null, passingYards: 280, timePrecision: 'SEASON_WEEK', scheduledDate: '2026-09-13' });
    expect(result.historicalUsage[0]).not.toHaveProperty('observedAt');
    expect(result.historicalUsage[0].provenance.knownAt).toBe(CAPTURED);
  });

  it('recognizes nflverse NA as missing rather than a fabricated identity, team, status or numeric zero', () => {
    const input = fixture(); input.roster = table('roster', [{ ...input.roster.rows[0], gsis_id: 'NA', status: 'NA', team: 'NA' }]);
    input.games = [table('games', [{ ...input.games![0].rows[0], targets: 'NA' }])];
    const result = buildBetaReferenceLedger(input);
    expect(result.memberships[0]).toMatchObject({ gsisId: null, team: null, rawStatus: null, statusEvidence: 'MISSING_RAW_STATUS' });
    expect(result.historicalUsage[0].targets).toBeNull();
    expect(result.issues).toEqual([]);
  });

  it('does not override contradictory raw game coordinates with a convenient schedule match', () => {
    const input = fixture(); input.games = [table('games', [{ ...input.games![0].rows[0], game_id: '2026_01_BUF_MIA' }])];
    const result = buildBetaReferenceLedger(input);
    expect(result.historicalUsage[0].gameId).toBeNull();
    expect(result.historicalUsage[0].passingYards).toBe(280);
    expect(result.issues.map((i) => i.code)).toContain('USAGE_GAME_JOIN_UNRESOLVED');
  });

  it('reuses canonical team aliases for historical joins while preserving the provider game ID and raw teams', () => {
    const input = fixture(); input.schedule = table('schedule', [{ ...input.schedule.rows[0],
      game_id: '2017_01_OAK_TEN', season: '2017', away_team: 'OAK', home_team: 'TEN', gameday: '2017-09-10' }]);
    input.playByPlay = table('pbp', []);
    input.games = [table('games', [{ ...input.games![0].rows[0], game_id: '2017_01_OAK_TEN', season: '2017', team: 'LV', opponent_team: 'TEN' }])];
    const result = buildBetaReferenceLedger(input);
    expect(result.historicalUsage[0]).toMatchObject({ gameId: '2017_01_OAK_TEN', team: 'LV', canonicalTeam: 'LV' });
    expect(result.issues).toEqual([]);
  });

  it('fails closed on future capture times, future source updates and malformed source identities', () => {
    for (const delta of [{ capturedAt: '2026-09-23T00:00:00Z' }, { sourceUpdatedAt: '2026-09-23T00:00:00Z' },
      { checksum: 'not-a-sha256' }, { id: 'https://secret.example/?token=redacted' }]) {
      const input = fixture(); input.roster = { ...input.roster, source: { ...input.roster.source, ...delta } };
      expect(() => buildBetaReferenceLedger(input)).toThrow('BETA_REFERENCE_SOURCE_IDENTITY_INVALID');
    }
  });

  it('rejects future event records without hiding the scheduled future game', () => {
    const input = fixture(); input.schedule = table('schedule', [{ ...input.schedule.rows[0], gameday: '2026-09-27' }]);
    input.playByPlay = table('pbp', [{ ...input.playByPlay.rows[0], start_time: '' }]);
    const result = buildBetaReferenceLedger(input);
    expect(result.games[0].finalKnownBy).toBeNull();
    expect(result.memberships).toEqual([]);
    expect(result.historicalUsage).toEqual([]);
    expect(result.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['PBP_FUTURE_FINAL_EVENT', 'ROSTER_PERIOD_FUTURE', 'USAGE_EVENT_FUTURE']));
  });

  it('does not authorize a mismatched or future actual-start record', () => {
    for (const row of [{ ...fixture().playByPlay.rows[0], home_team: 'MIA' },
      { ...fixture().playByPlay.rows[0], start_time: '9/23/26, 13:00:00' }]) {
      const input = fixture(); input.playByPlay = table('pbp', [row]);
      const result = buildBetaReferenceLedger(input);
      expect(result.games[0]).toMatchObject({ state: 'COMPLETION_UNCONFIRMED', finalKnownBy: null, actualStartedAt: null });
      expect(result.inputIntegrity).toBe(false);
    }
  });

  it('rejects conflicting schedule definitions before linking completion or usage', () => {
    const input = fixture(); input.schedule = table('schedule', [input.schedule.rows[0], { ...input.schedule.rows[0], gameday: '2026-09-14' }]);
    const result = buildBetaReferenceLedger(input);
    expect(result.games).toEqual([]);
    expect(result.historicalUsage[0].gameId).toBeNull();
    expect(result.issues.map((i) => i.code)).toContain('SCHEDULE_COORDINATE_CONFLICT');
  });

  it('does not accept invalid dates, fractional/negative counts or conflicting identity links', () => {
    const input = fixture(); input.schedule = table('schedule', [{ ...input.schedule.rows[0], gameday: '2026-02-30' }]);
    input.games = [table('games', [{ ...input.games![0].rows[0], targets: '-1', carries: '1.5' }])];
    const result = buildBetaReferenceLedger(input);
    expect(result.games).toEqual([]);
    expect(result.historicalUsage[0]).toMatchObject({ targets: null, carries: null });
    input.identities = [{ gsisId: '00-001', canonicalId: 'one' }, { gsisId: '00-001', canonicalId: 'two' }];
    expect(() => buildBetaReferenceLedger(input)).toThrow('BETA_REFERENCE_PLAYER_IDENTITY_INVALID');
  });
});
