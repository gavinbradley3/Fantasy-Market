// Typed registry of the fictional TE fixtures. Inputs are imported from their
// canonical golden fixture files under fixtures/te/ (the TE engine keeps its
// original standalone layout) and are never mutated. The nine core archetypes
// populate the primary selector; the four scenario/invariant fixtures live in a
// secondary "Test scenarios" group so the main selector stays uncluttered. The
// Weekly EFO shown in the UI is always computed from evaluateTightEnd, never
// from this file.

import eliteJson from '../../../fixtures/te/elite-receiving-focal-point.json';
import balancedJson from '../../../fixtures/te/full-time-balanced.json';
import blockingJson from '../../../fixtures/te/blocking-heavy-starter.json';
import redZoneJson from '../../../fixtures/te/red-zone-specialist.json';
import lowRouteJson from '../../../fixtures/te/low-route-high-tprr.json';
import youngJson from '../../../fixtures/te/young-breakout.json';
import committeeJson from '../../../fixtures/te/committee-tight-end.json';
import veteranJson from '../../../fixtures/te/aging-veteran.json';
import injuryJson from '../../../fixtures/te/injury-return.json';
import outJson from '../../../fixtures/te/out-player.json';
import missingJson from '../../../fixtures/te/missing-data.json';
import equalHighJson from '../../../fixtures/te/equal-snaps-high-routes.json';
import equalLowJson from '../../../fixtures/te/equal-snaps-low-routes.json';
import type { TEMVPInput } from '@/te-model';

export interface TEFixtureEntry {
  id: string;
  archetype: string;
  input: TEMVPInput;
}

// Cast: the fixtures are authored to the TEMVPInput contract; JSON import widens
// literal types (e.g. draft_round: number), so we assert the known-good shape.
const asInput = (json: unknown): TEMVPInput => json as TEMVPInput;

// Nine core archetypes — the primary selector.
export const TE_CORE_FIXTURES: TEFixtureEntry[] = [
  { id: 'elite-receiving-focal-point', archetype: 'Elite receiving focal point', input: asInput(eliteJson) },
  { id: 'full-time-balanced', archetype: 'Full-time balanced TE', input: asInput(balancedJson) },
  { id: 'blocking-heavy-starter', archetype: 'Blocking-heavy starter', input: asInput(blockingJson) },
  { id: 'red-zone-specialist', archetype: 'Red-zone specialist', input: asInput(redZoneJson) },
  { id: 'low-route-high-tprr', archetype: 'Low-route, high-TPRR', input: asInput(lowRouteJson) },
  { id: 'young-breakout', archetype: 'Young breakout', input: asInput(youngJson) },
  { id: 'committee-tight-end', archetype: 'Committee tight end', input: asInput(committeeJson) },
  { id: 'aging-veteran', archetype: 'Aging veteran', input: asInput(veteranJson) },
  { id: 'injury-return', archetype: 'Injury-return player', input: asInput(injuryJson) },
];

// Edge-case / invariant scenarios — a secondary, clearly-labeled group.
export const TE_EDGE_FIXTURES: TEFixtureEntry[] = [
  { id: 'out-player', archetype: 'Out player', input: asInput(outJson) },
  { id: 'missing-data', archetype: 'Missing-data player', input: asInput(missingJson) },
  { id: 'equal-snaps-high-routes', archetype: 'Equal snaps, high routes', input: asInput(equalHighJson) },
  { id: 'equal-snaps-low-routes', archetype: 'Equal snaps, low routes', input: asInput(equalLowJson) },
];

export const TE_FIXTURES: TEFixtureEntry[] = [...TE_CORE_FIXTURES, ...TE_EDGE_FIXTURES];

export const DEFAULT_FIXTURE_ID = TE_CORE_FIXTURES[0].id;

export function getFixture(id: string): TEFixtureEntry | undefined {
  return TE_FIXTURES.find((f) => f.id === id);
}
