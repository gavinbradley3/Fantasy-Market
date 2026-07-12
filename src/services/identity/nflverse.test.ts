import { describe, expect, it } from 'vitest';
import {
  enrichNflverseRecords,
  loadNflversePlayersEnrichment,
  loadNflverseRoster,
  NflverseSchemaError,
} from '@/services/identity/nflverse';
import { playersCsv, rosterCsv } from '@/services/identity/testutil';

describe('loadNflverseRoster', () => {
  it('loads a valid roster and normalizes fields', () => {
    const out = loadNflverseRoster(
      rosterCsv([
        {
          gsis_id: '00-0031234',
          full_name: 'Amon-Ra St. Brown',
          team: 'DET',
          position: 'WR',
          birth_date: '1999-10-24',
          sleeper_id: '7547',
          years_exp: '4',
        },
      ]),
      2025,
    );
    expect(out.records).toHaveLength(1);
    const r = out.records[0];
    expect(r.gsisId).toBe('00-0031234');
    expect(r.nameKey).toBe('amonrastbrown');
    expect(r.team).toBe('DET');
    expect(r.sleeperId).toBe('7547');
    expect(r.yearsExperience).toBe(4);
    expect(r.season).toBe(2025);
  });

  it('throws loudly when a required column is missing (schema drift)', () => {
    const noGsis = 'season,team,position,full_name\n2025,DET,WR,Somebody\n';
    expect(() => loadNflverseRoster(noGsis, 2025)).toThrow(NflverseSchemaError);
    expect(() => loadNflverseRoster(noGsis, 2025)).toThrow(/gsis_id/);
  });

  it('throws on a renamed column (drift is observable, not silent)', () => {
    const renamed = rosterCsv([{ gsis_id: '00-1' }]).replace('full_name', 'player_name');
    expect(() => loadNflverseRoster(renamed, 2025)).toThrow(NflverseSchemaError);
  });

  it('keeps the first row for a duplicated gsis_id and counts the repeats', () => {
    const out = loadNflverseRoster(
      rosterCsv([
        { gsis_id: '00-1', full_name: 'First Row', team: 'DET' },
        { gsis_id: '00-1', full_name: 'Second Row', team: 'CHI' },
      ]),
      2025,
    );
    expect(out.records).toHaveLength(1);
    expect(out.records[0].fullName).toBe('First Row');
    expect(out.duplicateIds).toBe(1);
  });

  it('null/NA team becomes null (free agent), never a guessed franchise', () => {
    const out = loadNflverseRoster(
      rosterCsv([{ gsis_id: '00-1', full_name: 'Free Agent', team: 'NA' }]),
      2025,
    );
    expect(out.records[0].team).toBeNull();
  });

  it('rows from other seasons are skipped, not errors (historical rosters)', () => {
    const out = loadNflverseRoster(
      rosterCsv([
        { gsis_id: '00-1', full_name: 'Old Row', season: 2019 },
        { gsis_id: '00-2', full_name: 'Current Row', season: 2025 },
      ]),
      2025,
    );
    expect(out.records.map((r) => r.gsisId)).toEqual(['00-2']);
    expect(out.otherSeasonRows).toBe(1);
    expect(out.invalidRecords).toBe(0);
  });

  it('unsupported positions are excluded and counted', () => {
    const out = loadNflverseRoster(
      rosterCsv([
        { gsis_id: '00-1', position: 'K' },
        { gsis_id: '00-2', position: 'FB' },
        { gsis_id: '00-3', position: 'TE', full_name: 'Kept Player' },
      ]),
      2025,
    );
    expect(out.records).toHaveLength(1);
    expect(out.unsupportedPosition).toBe(2);
  });

  it('malformed birth dates become null instead of silently passing', () => {
    const out = loadNflverseRoster(
      rosterCsv([{ gsis_id: '00-1', full_name: 'Bad Date', birth_date: '31/31/1999' }]),
      2025,
    );
    expect(out.records[0].birthDate).toBeNull();
  });

  it('rows lacking gsis_id are quarantined (required source id), rest survive', () => {
    const out = loadNflverseRoster(
      rosterCsv([
        { gsis_id: 'NA', full_name: 'No Id' },
        { gsis_id: '00-2', full_name: 'Has Id' },
      ]),
      2025,
    );
    expect(out.records.map((r) => r.gsisId)).toEqual(['00-2']);
    expect(out.invalidRecords).toBe(1);
    expect(out.issues[0]).toContain('No Id');
  });

  it('unreadable CSV (source failure artifact) throws a schema error', () => {
    expect(() => loadNflverseRoster('', 2025)).toThrow(NflverseSchemaError);
    expect(() => loadNflverseRoster('<html>503</html>"', 2025)).toThrow(NflverseSchemaError);
  });
});

describe('players.csv enrichment', () => {
  it('enriches draft round and backfills missing birth dates only', () => {
    const roster = loadNflverseRoster(
      rosterCsv([
        { gsis_id: '00-1', full_name: 'Has Own Date', birth_date: '1999-01-01' },
        { gsis_id: '00-2', full_name: 'Needs Backfill' },
      ]),
      2025,
    ).records;
    const enrichment = loadNflversePlayersEnrichment(
      playersCsv([
        { gsis_id: '00-1', display_name: 'Has Own Date', birth_date: '1998-12-31', draft_round: '2' },
        { gsis_id: '00-2', display_name: 'Needs Backfill', birth_date: '2001-05-05' },
      ]),
    );
    const [a, b] = enrichNflverseRecords(roster, enrichment);
    expect(a.draftRound).toBe(2);
    expect(a.birthDate).toBe('1999-01-01'); // roster value wins; enrichment only backfills
    expect(b.draftRound).toBeNull(); // NA draft round stays null — never zero
    expect(b.birthDate).toBe('2001-05-05');
  });

  it('missing required enrichment column throws', () => {
    expect(() => loadNflversePlayersEnrichment('gsis_id,foo\n00-1,x\n')).toThrow(NflverseSchemaError);
  });

  it('null enrichment leaves records untouched', () => {
    const roster = loadNflverseRoster(rosterCsv([{ gsis_id: '00-1' }]), 2025).records;
    expect(enrichNflverseRecords(roster, null)).toEqual(roster);
  });
});
