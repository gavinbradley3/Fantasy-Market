import type { PublishedMarket } from './types';

/**
 * Browser-safe descriptions for immutable backend league schema identifiers.
 *
 * Keep the verified schema/scoring facts explicit here instead of importing valuation modules
 * into the browser bundle. The accompanying drift test pins every field to the backend's actual
 * LeagueSchema and ScoringRules definitions.
 */
export const RECOGNIZED_PUBLICATION_FORMATS = Object.freeze({
  'dynasty-superflex-12': Object.freeze({
    schemaVersion: 1,
    scoringId: 'ppr-1.0',
    label: '12-team Dynasty · Superflex · Full PPR',
    compactLabel: 'Superflex · Full PPR',
  }),
});

export type PublicationFormatResolution =
  | { readonly kind: 'recognized'; readonly schemaId: string; readonly label: string; readonly compactLabel: string }
  | { readonly kind: 'legacy'; readonly label: 'Legacy board · format unavailable' }
  | { readonly kind: 'unknown'; readonly schemaId: string; readonly label: 'Published format unrecognized' }
  | { readonly kind: 'conflict'; readonly label: 'Published format inconsistent' }
  | { readonly kind: 'unavailable'; readonly label: 'Published format unavailable' };

/** Resolve format from the complete admitted publication, never from filtered visible rows. */
export function resolvePublicationFormat(
  market: Pick<PublishedMarket, 'dynastyContract' | 'players'> | undefined,
): PublicationFormatResolution {
  if (!market) return { kind: 'unavailable', label: 'Published format unavailable' };
  if (market.dynastyContract === 'legacy') {
    return { kind: 'legacy', label: 'Legacy board · format unavailable' };
  }
  if (market.players.length === 0) {
    return { kind: 'unavailable', label: 'Published format unavailable' };
  }

  const ids = new Set(market.players.map((player) => player.leagueSchemaId));
  if (ids.size !== 1) return { kind: 'conflict', label: 'Published format inconsistent' };

  const schemaId = [...ids][0];
  if (schemaId === null) return { kind: 'unavailable', label: 'Published format unavailable' };

  if (!Object.prototype.hasOwnProperty.call(RECOGNIZED_PUBLICATION_FORMATS, schemaId)) {
    return { kind: 'unknown', schemaId, label: 'Published format unrecognized' };
  }
  const format = RECOGNIZED_PUBLICATION_FORMATS[
    schemaId as keyof typeof RECOGNIZED_PUBLICATION_FORMATS
  ];

  return { kind: 'recognized', schemaId, label: format.label, compactLabel: format.compactLabel };
}
