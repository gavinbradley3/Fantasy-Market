// Typed registry of the fictional WR fixtures. Inputs are imported from their
// canonical fixture files (Vite resolveJsonModule) and never mutated. The five
// core archetypes populate the primary selector; the two scenario fixtures live in
// a secondary "Test scenarios" group so the main selector stays uncluttered
// (mirrors the RB/TE/QB edge-fixture presentation). The archetype labels are
// display copy for the selector; the Weekly EFO shown in the UI is always computed
// from evaluateWideReceiver, never from this file.

import eliteJson from '@/wr-model/fixtures/wr/elite-full-time.json';
import lowRouteJson from '@/wr-model/fixtures/wr/low-route-high-tprr.json';
import rookieJson from '@/wr-model/fixtures/wr/round-one-rookie.json';
import veteranJson from '@/wr-model/fixtures/wr/declining-veteran.json';
import deepJson from '@/wr-model/fixtures/wr/deep-threat-low-efficiency.json';
import outJson from '@/wr-model/fixtures/wr/out-player.json';
import missingJson from '@/wr-model/fixtures/wr/missing-data.json';
import type { WRMVPInput } from '@/wr-model/types';

export interface WRFixtureEntry {
  id: string;
  archetype: string;
  input: WRMVPInput;
}

// Cast: the fixtures are authored to the WRMVPInput contract; JSON import widens
// literal types (e.g. draft_round: number), so we assert the known-good shape.
const asInput = (json: unknown): WRMVPInput => json as WRMVPInput;

// Five core archetypes — the primary selector.
export const WR_FIXTURES: WRFixtureEntry[] = [
  { id: 'elite-full-time', archetype: 'Elite target earner', input: asInput(eliteJson) },
  { id: 'low-route-high-tprr', archetype: 'Limited-role breakout', input: asInput(lowRouteJson) },
  { id: 'round-one-rookie', archetype: 'High-upside rookie', input: asInput(rookieJson) },
  { id: 'declining-veteran', archetype: 'Productive declining veteran', input: asInput(veteranJson) },
  { id: 'deep-threat-low-efficiency', archetype: 'Volatile deep threat', input: asInput(deepJson) },
];

// Edge-case scenarios — a secondary, clearly-labeled group.
export const WR_EDGE_FIXTURES: WRFixtureEntry[] = [
  { id: 'out-player', archetype: 'Out player', input: asInput(outJson) },
  { id: 'missing-data', archetype: 'Missing-data player', input: asInput(missingJson) },
];

export const WR_ALL_FIXTURES: WRFixtureEntry[] = [...WR_FIXTURES, ...WR_EDGE_FIXTURES];

export const DEFAULT_FIXTURE_ID = WR_FIXTURES[0].id;

export function getFixture(id: string): WRFixtureEntry | undefined {
  return WR_ALL_FIXTURES.find((f) => f.id === id);
}
