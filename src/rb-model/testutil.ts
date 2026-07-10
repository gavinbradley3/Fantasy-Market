// Test-only helpers for loading fixtures and golden snapshots (node/vitest).
// Not imported by the application; excluded from the app bundle.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RBMVPInput, RBMVPOutput } from '@/rb-model/types';

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = join(here, 'fixtures', 'rb');
export const EXPECTED_DIR = join(FIXTURE_DIR, 'expected');

// The ten mandatory golden fixtures (§26.16.11). The mobile-QB comparison (item
// 10) is a matched pair, so it contributes two fixture files.
export const PRIMARY_FIXTURES = [
  'elite-bell-cow',
  'goal-line-specialist',
  'receiving-specialist',
  'committee-back',
  'explosive-rookie',
  'aging-veteran',
  'injury-return',
  'out-player',
  'missing-data',
  'mobile-qb-low-pressure',
  'mobile-qb-high-pressure',
] as const;

export function loadFixture(name: string): RBMVPInput {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), 'utf8')) as RBMVPInput;
}

export function loadExpected(name: string): RBMVPOutput {
  return JSON.parse(readFileSync(join(EXPECTED_DIR, `${name}.expected.json`), 'utf8')) as RBMVPOutput;
}
