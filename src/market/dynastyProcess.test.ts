import { describe, expect, it } from 'vitest';
import { IdentityResolver } from '@/ingestion/identity';
import { adaptDynastyProcess, buildFpToGsis, DYNASTYPROCESS_SOURCE } from './dynastyProcess';
import type { DynastyProcessIdRow, DynastyProcessValueRow } from './dynastyProcess';

const INGESTED_AT = '2026-09-11T18:00:00.000Z';

// Real ids, so the canonical ids these produce are the same ones the live board carries.
const ID_ROWS: DynastyProcessIdRow[] = [
  { fantasypros_id: '17298', gsis_id: '00-0034857', name: 'Josh Allen', position: 'QB', team: 'BUF' },
  { fantasypros_id: '19236', gsis_id: '00-0036322', name: 'Justin Jefferson', position: 'WR', team: 'MIN' },
  // The OTHER Justin Jefferson — a Browns linebacker. Present on purpose.
  { fantasypros_id: '28472', gsis_id: '00-0041075', name: 'Justin Jefferson', position: 'LB', team: 'CLE' },
  { fantasypros_id: '23133', gsis_id: '00-0038542', name: 'Bijan Robinson', position: 'RB', team: 'ATL' },
  { fantasypros_id: '22936', gsis_id: '00-0037744', name: 'Trey McBride', position: 'TE', team: 'ARI' },
  { fantasypros_id: '99999', name: 'No Gsis Player', position: 'WR', team: 'FA' },
];

const VALUE_ROWS: DynastyProcessValueRow[] = [
  { player: 'Josh Allen', pos: 'QB', team: 'BUF', value_1qb: '7000', value_2qb: '10256', ecr_1qb: '14.2', ecr_2qb: '1', scrape_date: '2026-09-11', fp_id: '17298' },
  { player: 'Justin Jefferson', pos: 'WR', team: 'MIN', value_1qb: '9000', value_2qb: '8070', ecr_1qb: '2.1', ecr_2qb: '11.2', scrape_date: '2026-09-11', fp_id: '19236' },
  { player: 'Bijan Robinson', pos: 'RB', team: 'ATL', value_1qb: '8800', value_2qb: '7976', ecr_1qb: '3.0', ecr_2qb: '11.7', scrape_date: '2026-09-11', fp_id: '23133' },
  { player: 'Trey McBride', pos: 'TE', team: 'ARI', value_1qb: '4500', value_2qb: '4140', ecr_1qb: '30.1', ecr_2qb: '39.6', scrape_date: '2026-09-11', fp_id: '22936' },
];

const opts = (over: Partial<Parameters<typeof adaptDynastyProcess>[2]> = {}) => ({
  format: 'dynasty_superflex' as const,
  ingestedAt: INGESTED_AT,
  ...over,
});

describe('buildFpToGsis', () => {
  it('bridges only rows carrying both ids', () => {
    const map = buildFpToGsis(ID_ROWS);
    expect(map.get('17298')).toBe('00-0034857');
    expect(map.has('99999')).toBe(false); // no gsis → cannot bridge
  });

  it('keeps the two Justin Jeffersons apart', () => {
    const map = buildFpToGsis(ID_ROWS);
    expect(map.get('19236')).toBe('00-0036322'); // WR, MIN
    expect(map.get('28472')).toBe('00-0041075'); // LB, CLE
    expect(map.get('19236')).not.toBe(map.get('28472'));
  });
});

describe('adaptDynastyProcess — identity', () => {
  it('resolves to the SAME canonical ids the pipeline mints from gsis', () => {
    const batch = adaptDynastyProcess(VALUE_ROWS, ID_ROWS, opts());
    const byName = new Map(batch.snapshots.map((s) => [s.sourcePlayerId, s.canonicalPlayerId]));

    // Independently resolve the same gsis ids through the pipeline's own resolver.
    const r = new IdentityResolver();
    const expected = (gsis: string) =>
      r.resolve({ providerIds: { gsis }, nameNormalized: 'x', position: null, provider: 'nflverse' }).canonicalId;

    expect(byName.get('17298')).toBe(expected('00-0034857'));
    expect(byName.get('19236')).toBe(expected('00-0036322'));
    expect(byName.get('23133')).toBe(expected('00-0038542'));
    expect(byName.get('22936')).toBe(expected('00-0037744'));
  });

  it('picks the WR Justin Jefferson, not the linebacker, because the join is by id', () => {
    const batch = adaptDynastyProcess(VALUE_ROWS, ID_ROWS, opts());
    const jj = batch.snapshots.find((s) => s.sourcePlayerId === '19236');
    const r = new IdentityResolver();
    const wr = r.resolve({ providerIds: { gsis: '00-0036322' }, nameNormalized: 'x', position: null, provider: 'nflverse' }).canonicalId;
    const lb = r.resolve({ providerIds: { gsis: '00-0041075' }, nameNormalized: 'x', position: null, provider: 'nflverse' }).canonicalId;
    expect(jj?.canonicalPlayerId).toBe(wr);
    expect(jj?.canonicalPlayerId).not.toBe(lb);
    expect(jj?.sourcePosition).toBe('WR');
  });

  it('rejects a row whose fp_id has no gsis bridge instead of guessing', () => {
    const rows: DynastyProcessValueRow[] = [
      { player: 'No Gsis Player', pos: 'WR', team: 'FA', value_2qb: '100', scrape_date: '2026-09-11', fp_id: '99999' },
    ];
    const batch = adaptDynastyProcess(rows, ID_ROWS, opts());
    expect(batch.snapshots).toHaveLength(0);
    expect(batch.rejections[0]).toMatchObject({ reason: 'UNRESOLVED_IDENTITY', sourcePlayerId: '99999' });
  });

  it('rejects a row with no source id rather than name-matching it', () => {
    const batch = adaptDynastyProcess([{ player: 'Mystery Man', pos: 'WR', value_2qb: '50' }], ID_ROWS, opts());
    expect(batch.rejections[0].reason).toBe('NO_SOURCE_ID');
  });

  it('reports duplicates instead of letting a second row overwrite the first', () => {
    const batch = adaptDynastyProcess([VALUE_ROWS[0], VALUE_ROWS[0]], ID_ROWS, opts());
    expect(batch.snapshots).toHaveLength(1);
    expect(batch.rejections[0].reason).toBe('DUPLICATE');
  });

  it('drops positions the market lens does not cover', () => {
    const rows: DynastyProcessValueRow[] = [{ player: 'A Kicker', pos: 'K', value_2qb: '10', fp_id: '17298' }];
    expect(adaptDynastyProcess(rows, ID_ROWS, opts()).rejections[0].reason).toBe('POSITION_MISMATCH');
  });
});

describe('adaptDynastyProcess — formats', () => {
  it('reads Superflex from value_2qb and 1QB from value_1qb — never interchanging them', () => {
    const sf = adaptDynastyProcess(VALUE_ROWS, ID_ROWS, opts({ format: 'dynasty_superflex' }));
    const oneQb = adaptDynastyProcess(VALUE_ROWS, ID_ROWS, opts({ format: 'dynasty_1qb' }));

    const allenSf = sf.snapshots.find((s) => s.sourcePlayerId === '17298');
    const allen1 = oneQb.snapshots.find((s) => s.sourcePlayerId === '17298');
    expect(allenSf?.value).toBe(10256);
    expect(allen1?.value).toBe(7000);
    expect(allenSf?.format).toBe('dynasty_superflex');
    expect(allen1?.format).toBe('dynasty_1qb');
  });

  it('ranks the QB first in Superflex and the WR first in 1QB — the formats really differ', () => {
    const sf = adaptDynastyProcess(VALUE_ROWS, ID_ROWS, opts({ format: 'dynasty_superflex' }));
    const oneQb = adaptDynastyProcess(VALUE_ROWS, ID_ROWS, opts({ format: 'dynasty_1qb' }));
    expect(sf.snapshots.find((s) => s.overallRank === 1)?.sourcePosition).toBe('QB');
    expect(oneQb.snapshots.find((s) => s.overallRank === 1)?.sourcePosition).toBe('WR');
  });
});

describe('adaptDynastyProcess — values and ranks', () => {
  it('keeps the fractional consensus rank separate from the derived integer rank', () => {
    const batch = adaptDynastyProcess(VALUE_ROWS, ID_ROWS, opts());
    const jj = batch.snapshots.find((s) => s.sourcePlayerId === '19236');
    expect(jj?.sourceConsensusRank).toBe(11.2); // as published — fractional
    expect(Number.isInteger(jj?.overallRank)).toBe(true); // derived by ordering
  });

  it('assigns dense position ranks within the batch', () => {
    const batch = adaptDynastyProcess(VALUE_ROWS, ID_ROWS, opts());
    for (const s of batch.snapshots) expect(s.positionRank).toBe(1); // one player per position here
  });

  it('treats a missing value as absent, not as zero, and leaves it unranked', () => {
    const rows: DynastyProcessValueRow[] = [
      { player: 'Josh Allen', pos: 'QB', value_2qb: 'NA', scrape_date: '2026-09-11', fp_id: '17298' },
    ];
    const batch = adaptDynastyProcess(rows, ID_ROWS, opts());
    expect(batch.snapshots[0].value).toBeNull();
    expect(batch.snapshots[0].overallRank).toBeNull();
  });

  it('rejects a negative value', () => {
    const rows: DynastyProcessValueRow[] = [{ player: 'Josh Allen', pos: 'QB', value_2qb: '-5', fp_id: '17298' }];
    expect(adaptDynastyProcess(rows, ID_ROWS, opts()).rejections[0].reason).toBe('INVALID_VALUE');
  });

  it('marks external provenance and the source key', () => {
    const batch = adaptDynastyProcess(VALUE_ROWS, ID_ROWS, opts());
    expect(batch.source).toBe(DYNASTYPROCESS_SOURCE);
    for (const s of batch.snapshots) {
      expect(s.provenance).toBe('external');
      expect(s.source).toBe(DYNASTYPROCESS_SOURCE);
    }
  });

  it('retains the source dataset version verbatim, on the batch and on every row', () => {
    // `scrape_date` as the source spelled it — the thread back to the exact published file.
    const batch = adaptDynastyProcess(VALUE_ROWS, ID_ROWS, opts());
    expect(batch.sourceVersion).toBe('2026-09-11');
    for (const s of batch.snapshots) expect(s.sourceVersion).toBe('2026-09-11');
  });

  it('reports no version rather than a fabricated one when the source publishes none', () => {
    const rows = VALUE_ROWS.map((r) => ({ ...r, scrape_date: undefined }));
    const batch = adaptDynastyProcess(rows, ID_ROWS, opts());
    expect(batch.sourceVersion).toBeNull();
    for (const s of batch.snapshots) expect(s.sourceVersion).toBeNull();
  });
});

describe('adaptDynastyProcess — freshness', () => {
  it('is fresh when the scrape date is recent', () => {
    const batch = adaptDynastyProcess(VALUE_ROWS, ID_ROWS, opts());
    expect(batch.snapshots[0].freshness).toBe('fresh');
  });

  it('is stale once the source stamp is older than the window', () => {
    const batch = adaptDynastyProcess(VALUE_ROWS, ID_ROWS, opts({ ingestedAt: '2026-10-30T00:00:00.000Z' }));
    expect(batch.snapshots[0].freshness).toBe('stale');
  });

  it('is deterministic — same input, same output', () => {
    const a = adaptDynastyProcess(VALUE_ROWS, ID_ROWS, opts());
    const b = adaptDynastyProcess(VALUE_ROWS, ID_ROWS, opts());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
