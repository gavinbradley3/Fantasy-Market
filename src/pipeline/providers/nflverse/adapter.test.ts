import { describe, expect, it } from 'vitest';
import { nflverseAdapter } from '@/pipeline/providers/nflverse/adapter';
import { rawPayload } from '@/pipeline/test-support';

describe('nflverseAdapter', () => {
  const result = nflverseAdapter.parse(rawPayload('nflverse'));

  it('parses supported players keyed by GSIS id', () => {
    expect(result.records).toHaveLength(7);
    expect(result.records.every((r) => r.crossIds.gsis === r.providerPlayerId)).toBe(true);
  });

  it('rejects rows missing the primary GSIS id', () => {
    expect(result.rejected.some((r) => r.reason === 'MISSING_PRIMARY_ID')).toBe(true);
  });

  it('rejects unsupported positions but keeps supported ones', () => {
    expect(result.rejected.some((r) => r.reason === 'UNSUPPORTED_POSITION')).toBe(true);
  });

  it('maps draft capital from numeric or string columns', () => {
    const chase = result.records.find((r) => r.providerPlayerId === '00-0036900');
    expect(chase?.draftRound).toBe(1);
    expect(chase?.draftPick).toBe(5);
    expect(chase?.draftYear).toBe(2021);
    expect(chase?.rookieYear).toBe(2021);
  });

  it('maps retired status to inactive without guessing active', () => {
    const calvin = result.records.find((r) => r.providerPlayerId === '00-0026035');
    expect(calvin?.status).toBe('inactive');
  });

  it('drops out-of-range draft rounds rather than accepting them', () => {
    const r = nflverseAdapter.parse([
      { gsis_id: '00-1', full_name: 'Bad Round', position: 'WR', draft_round: 12, draft_number: 999 },
    ]);
    expect(r.records[0].draftRound).toBeUndefined();
    expect(r.records[0].draftPick).toBeUndefined();
  });

  it('reports a non-array payload as a single rejection', () => {
    const r = nflverseAdapter.parse({ not: 'an array' });
    expect(r.records).toHaveLength(0);
    expect(r.rejected[0].reason).toBe('MALFORMED');
  });
});
