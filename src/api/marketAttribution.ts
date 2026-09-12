// Attribution for external market sources.
//
// WHY THIS IS CODE AND NOT A COMMENT
// A market value PlayerTicker serves was published by somebody else. Stripping that fact in
// transit is how an external number quietly becomes "PlayerTicker's number". Attribution
// therefore travels in the response body itself, on an envelope field that is never optional
// and never conditional — a client cannot render these values without having been told whose
// they are.
//
// LICENSING STATUS, stated plainly: DynastyProcess publishes its repository under GPL-3.0
// "for the purpose of supporting apps and developers". The VALUES are derived from FantasyPros
// expert consensus, and GPL covers DynastyProcess's code, not the upstream rights to those
// numbers. Internal comparison is defensible; public re-publication of the raw values is an
// open question. See docs/MARKET_DATA_SOURCES.md.

export interface MarketAttribution {
  /** The party that published the values. */
  readonly publisher: string;
  /** Where the dataset lives. */
  readonly url: string;
  /** The publisher's own licence for the dataset it distributes. */
  readonly licence: string;
  /** The party the values ultimately derive from, when that differs from the publisher. */
  readonly derivedFrom: string | null;
  /** How often the publisher refreshes — the honest ceiling on any movement window. */
  readonly refreshCadence: string;
  /** Restrictions a consumer must respect. */
  readonly usage: string;
}

const DYNASTYPROCESS: MarketAttribution = {
  publisher: 'DynastyProcess',
  url: 'https://github.com/dynastyprocess/data',
  licence: 'GPL-3.0',
  derivedFrom: 'FantasyPros expert consensus',
  refreshCadence: 'weekly',
  usage:
    'External comparison source, not PlayerTicker-owned market data. Upstream republication ' +
    'rights for the underlying consensus values are unresolved; do not present these numbers ' +
    'as PlayerTicker valuations or redistribute the source dataset.',
};

/** A source with no attribution entry is served as unattributed, never as ours. */
const UNKNOWN: MarketAttribution = {
  publisher: 'unknown',
  url: '',
  licence: 'unknown',
  derivedFrom: null,
  refreshCadence: 'unknown',
  usage: 'External source with no recorded attribution. Treat as third-party data.',
};

export const MARKET_ATTRIBUTION: Readonly<Record<string, MarketAttribution>> = {
  dynastyprocess: DYNASTYPROCESS,
  unknown: UNKNOWN,
};
