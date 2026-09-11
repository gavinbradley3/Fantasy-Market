// The EXTERNAL market boundary — API wire shape in, frontend market model out.
//
// External market values are shown BESIDE PlayerTicker's valuations on the board, never merged
// into them. Everything exported here keeps the two sides distinguishable.

export { adaptMarket, formatLabel, marketUpdatedLabel } from './adapter';
export { COMPARISON_HORIZON, buildBoardComparisons, buildDynastyModelSide, countCovered } from './boardComparison';
export { useExternalMarket, type UseExternalMarketResult } from './useExternalMarket';
export type { ExternalMarket, MarketAttributionView } from './types';
