// Typed registry of the fictional RB fixtures. Inputs are imported from their
// canonical fixture files (Vite resolveJsonModule) and never mutated. The seven
// core archetypes populate the primary selector; the four scenario fixtures live
// in a secondary "Test scenarios" group so the main selector stays uncluttered.
// The Weekly EFO shown in the UI is always computed from evaluateRunningBack.

import eliteJson from '@/rb-model/fixtures/rb/elite-bell-cow.json';
import goalLineJson from '@/rb-model/fixtures/rb/goal-line-specialist.json';
import receivingJson from '@/rb-model/fixtures/rb/receiving-specialist.json';
import committeeJson from '@/rb-model/fixtures/rb/committee-back.json';
import rookieJson from '@/rb-model/fixtures/rb/explosive-rookie.json';
import veteranJson from '@/rb-model/fixtures/rb/aging-veteran.json';
import injuryJson from '@/rb-model/fixtures/rb/injury-return.json';
import outJson from '@/rb-model/fixtures/rb/out-player.json';
import missingJson from '@/rb-model/fixtures/rb/missing-data.json';
import mobileLowJson from '@/rb-model/fixtures/rb/mobile-qb-low-pressure.json';
import mobileHighJson from '@/rb-model/fixtures/rb/mobile-qb-high-pressure.json';
import type { RBMVPInput } from '@/rb-model/types';

export interface RBFixtureEntry {
  id: string;
  archetype: string;
  input: RBMVPInput;
}

// Cast: the fixtures are authored to the RBMVPInput contract; JSON import widens
// literal types, so we assert the known-good shape.
const asInput = (json: unknown): RBMVPInput => json as RBMVPInput;

// Seven core archetypes — the primary selector.
export const RB_CORE_FIXTURES: RBFixtureEntry[] = [
  { id: 'elite-bell-cow', archetype: 'Elite three-down bell cow', input: asInput(eliteJson) },
  { id: 'goal-line-specialist', archetype: 'Goal-line touchdown specialist', input: asInput(goalLineJson) },
  { id: 'receiving-specialist', archetype: 'Receiving specialist', input: asInput(receivingJson) },
  { id: 'committee-back', archetype: 'Committee back', input: asInput(committeeJson) },
  { id: 'explosive-rookie', archetype: 'Explosive rookie', input: asInput(rookieJson) },
  { id: 'aging-veteran', archetype: 'Aging veteran', input: asInput(veteranJson) },
  { id: 'injury-return', archetype: 'Injury-return player', input: asInput(injuryJson) },
];

// Edge-case scenarios — a secondary, clearly-labeled group.
export const RB_EDGE_FIXTURES: RBFixtureEntry[] = [
  { id: 'out-player', archetype: 'Out player', input: asInput(outJson) },
  { id: 'missing-data', archetype: 'Missing-data player', input: asInput(missingJson) },
  { id: 'mobile-qb-low-pressure', archetype: 'Mobile-QB, low pressure', input: asInput(mobileLowJson) },
  { id: 'mobile-qb-high-pressure', archetype: 'Mobile-QB, high pressure', input: asInput(mobileHighJson) },
];

export const RB_FIXTURES: RBFixtureEntry[] = [...RB_CORE_FIXTURES, ...RB_EDGE_FIXTURES];

export const DEFAULT_FIXTURE_ID = RB_CORE_FIXTURES[0].id;

export function getFixture(id: string): RBFixtureEntry | undefined {
  return RB_FIXTURES.find((f) => f.id === id);
}
