// Typed registry of the normative QB fixtures. Inputs are imported from their
// canonical fixture files under fixtures/qb/ (the QB engine keeps its original
// standalone layout) and are never mutated. Eleven core archetypes populate the
// primary selector; four scenario/edge fixtures live in a secondary "Test
// scenarios" group so the main selector stays uncluttered. The Weekly EFO shown
// in the UI is always computed from evaluateQuarterback, never from this file.

import eliteDualJson from '../../../fixtures/qb/QB-G01.json';
import pocketJson from '../../../fixtures/qb/QB-G02.json';
import highVolumeJson from '../../../fixtures/qb/QB-G03.json';
import gameManagerJson from '../../../fixtures/qb/QB-G04.json';
import rushingJson from '../../../fixtures/qb/QB-G05.json';
import breakoutJson from '../../../fixtures/qb/QB-G06.json';
import rookieJson from '../../../fixtures/qb/QB-G07.json';
import veteranJson from '../../../fixtures/qb/QB-G08.json';
import temporaryJson from '../../../fixtures/qb/QB-G09.json';
import competitionJson from '../../../fixtures/qb/QB-G10.json';
import injuryReturnJson from '../../../fixtures/qb/QB-G11.json';
import fallbackJson from '../../../fixtures/qb/QB-G12.json';
import youngBackupJson from '../../../fixtures/qb/QB-E01.json';
import benchedJson from '../../../fixtures/qb/QB-E02.json';
import outJson from '../../../fixtures/qb/QB-E03.json';
import type { QBMVPInput } from '@/qb-model';

export interface QBFixtureEntry {
  id: string;
  archetype: string;
  input: QBMVPInput;
}

// Cast: the fixtures are authored to the QBMVPInput contract; JSON import widens
// literal types (e.g. draft_round: number), so we assert the known-good shape.
const asInput = (json: unknown): QBMVPInput => json as QBMVPInput;

// Eleven core archetypes — the primary selector.
export const QB_CORE_FIXTURES: QBFixtureEntry[] = [
  { id: 'QB-G01', archetype: 'Elite dual threat', input: asInput(eliteDualJson) },
  { id: 'QB-G02', archetype: 'Elite pocket passer', input: asInput(pocketJson) },
  { id: 'QB-G03', archetype: 'High-volume inefficient starter', input: asInput(highVolumeJson) },
  { id: 'QB-G04', archetype: 'Low-volume game manager', input: asInput(gameManagerJson) },
  { id: 'QB-G05', archetype: 'Rushing-dependent QB', input: asInput(rushingJson) },
  { id: 'QB-G06', archetype: 'Young breakout', input: asInput(breakoutJson) },
  { id: 'QB-G07', archetype: 'Rookie expected starter', input: asInput(rookieJson) },
  { id: 'QB-G08', archetype: 'Veteran in decline', input: asInput(veteranJson) },
  { id: 'QB-G09', archetype: 'Temporary injury replacement', input: asInput(temporaryJson) },
  { id: 'QB-G10', archetype: 'Starting-role competition', input: asInput(competitionJson) },
  { id: 'QB-G11', archetype: 'Injury-return starter', input: asInput(injuryReturnJson) },
];

// Edge-case / scenario fixtures — a secondary, clearly-labeled group.
export const QB_EDGE_FIXTURES: QBFixtureEntry[] = [
  { id: 'QB-G12', archetype: 'Fallback-heavy profile', input: asInput(fallbackJson) },
  { id: 'QB-E01', archetype: 'Young backup', input: asInput(youngBackupJson) },
  { id: 'QB-E02', archetype: 'Recently benched', input: asInput(benchedJson) },
  { id: 'QB-E03', archetype: 'Out quarterback', input: asInput(outJson) },
];

export const QB_FIXTURES: QBFixtureEntry[] = [...QB_CORE_FIXTURES, ...QB_EDGE_FIXTURES];

export const DEFAULT_FIXTURE_ID = QB_CORE_FIXTURES[0].id;

export function getFixture(id: string): QBFixtureEntry | undefined {
  return QB_FIXTURES.find((f) => f.id === id);
}
