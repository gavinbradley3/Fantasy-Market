// Typed registry of the five fictional WR fixtures. Inputs are imported from
// their canonical fixture files (Vite resolveJsonModule) and never mutated. The
// archetype labels are display copy for the selector; the Weekly EFO shown in
// the UI is always computed from evaluateWideReceiver, never from this file.

import eliteJson from '@/wr-model/fixtures/wr/elite-full-time.json';
import lowRouteJson from '@/wr-model/fixtures/wr/low-route-high-tprr.json';
import rookieJson from '@/wr-model/fixtures/wr/round-one-rookie.json';
import veteranJson from '@/wr-model/fixtures/wr/declining-veteran.json';
import deepJson from '@/wr-model/fixtures/wr/deep-threat-low-efficiency.json';
import type { WRMVPInput } from '@/wr-model/types';

export interface WRFixtureEntry {
  id: string;
  archetype: string;
  input: WRMVPInput;
}

// Cast: the fixtures are authored to the WRMVPInput contract; JSON import widens
// literal types (e.g. draft_round: number), so we assert the known-good shape.
const asInput = (json: unknown): WRMVPInput => json as WRMVPInput;

export const WR_FIXTURES: WRFixtureEntry[] = [
  { id: 'elite-full-time', archetype: 'Elite target earner', input: asInput(eliteJson) },
  { id: 'low-route-high-tprr', archetype: 'Limited-role breakout', input: asInput(lowRouteJson) },
  { id: 'round-one-rookie', archetype: 'High-upside rookie', input: asInput(rookieJson) },
  { id: 'declining-veteran', archetype: 'Productive declining veteran', input: asInput(veteranJson) },
  { id: 'deep-threat-low-efficiency', archetype: 'Volatile deep threat', input: asInput(deepJson) },
];

export const DEFAULT_FIXTURE_ID = WR_FIXTURES[0].id;

export function getFixture(id: string): WRFixtureEntry | undefined {
  return WR_FIXTURES.find((f) => f.id === id);
}
