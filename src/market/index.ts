// PlayerTicker dynasty MARKET layer (prototype).
//
// Market values are external opinions about what a player is worth. They are stored and
// surfaced SEPARATELY from PlayerTicker's own model output so the two can be compared without
// ever being blended — see `ModelMarketComparison` in ./types.
//
// Node-only: ./store imports the persistence layer's SQLite adapter, so browser code must not
// import this barrel.

export * from './types';
export * from './dynastyProcess';
export { openMarketStore, type MarketSnapshotStore } from './store';
