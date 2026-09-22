import { describe, expect, it } from 'vitest';
import { DYNASTY_SUPERFLEX_12 } from '@/utility/leagueSchema';
import { PPR_SCORING } from '@/utility/scoring';
import type { PublishedMarket, PublishedPlayer } from './types';
import { RECOGNIZED_PUBLICATION_FORMATS, resolvePublicationFormat } from './format';

function market(ids: readonly (string | null)[], contract: PublishedMarket['dynastyContract'] = 'canonical') {
  return {
    dynastyContract: contract,
    players: ids.map((leagueSchemaId) => ({ leagueSchemaId })) as PublishedPlayer[],
  } as Pick<PublishedMarket, 'dynastyContract' | 'players'>;
}

describe('published format resolution', () => {
  it('maps the immutable production schema to its complete user-facing format', () => {
    expect(resolvePublicationFormat(market(['dynasty-superflex-12']))).toEqual({
      kind: 'recognized', schemaId: 'dynasty-superflex-12',
      label: '12-team Dynasty · Superflex · Full PPR', compactLabel: 'Superflex · Full PPR',
    });
  });

  it('does not invent metadata for legacy, missing, unknown, or empty publications', () => {
    expect(resolvePublicationFormat(market(['dynasty-superflex-12'], 'legacy')).kind).toBe('legacy');
    expect(resolvePublicationFormat(market([null]))).toEqual({ kind: 'unavailable', label: 'Published format unavailable' });
    expect(resolvePublicationFormat(market([]))).toEqual({ kind: 'unavailable', label: 'Published format unavailable' });
    expect(resolvePublicationFormat(market(['future-schema']))).toEqual({
      kind: 'unknown', schemaId: 'future-schema', label: 'Published format unrecognized',
    });
    expect(resolvePublicationFormat(market(['constructor']))).toEqual({
      kind: 'unknown', schemaId: 'constructor', label: 'Published format unrecognized',
    });
    expect(resolvePublicationFormat(market(['__proto__']))).toEqual({
      kind: 'unknown', schemaId: '__proto__', label: 'Published format unrecognized',
    });
  });

  it('rejects conflicting or partially missing entry metadata instead of selecting the first entry', () => {
    expect(resolvePublicationFormat(market(['dynasty-superflex-12', 'future-schema'])).kind).toBe('conflict');
    expect(resolvePublicationFormat(market(['dynasty-superflex-12', null])).kind).toBe('conflict');
  });

  it('guards the browser-safe label mapping against backend league/scoring drift', () => {
    const mapped = RECOGNIZED_PUBLICATION_FORMATS['dynasty-superflex-12'];
    expect(DYNASTY_SUPERFLEX_12).toMatchObject({
      id: 'dynasty-superflex-12', version: mapped.schemaVersion, teams: 12,
      label: '12-team dynasty Superflex', scoringId: mapped.scoringId,
    });
    expect(PPR_SCORING).toMatchObject({ id: mapped.scoringId, label: 'Full PPR', perReception: 1 });
    expect(mapped.label).toBe('12-team Dynasty · Superflex · Full PPR');
  });
});
