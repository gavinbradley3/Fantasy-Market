// Test-only helpers for loading fixtures and golden snapshots (node/vitest).
// Not imported by the application; excluded from the app bundle.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WRMVPInput, WRMVPOutput } from '@/wr-model/types';

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = join(here, 'fixtures', 'wr');
export const EXPECTED_DIR = join(FIXTURE_DIR, 'expected');

export const PRIMARY_FIXTURES = [
  'elite-full-time',
  'low-route-high-tprr',
  'round-one-rookie',
  'declining-veteran',
  'deep-threat-low-efficiency',
] as const;

export function loadFixture(name: string): WRMVPInput {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), 'utf8')) as WRMVPInput;
}

export function loadExpected(name: string): WRMVPOutput {
  return JSON.parse(readFileSync(join(EXPECTED_DIR, `${name}.expected.json`), 'utf8')) as WRMVPOutput;
}
