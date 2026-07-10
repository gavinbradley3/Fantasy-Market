// Generates the golden output snapshots for the RB MVP fixtures. Run ONLY after
// the formula/invariant tests pass (§26.16.11): a snapshot must never be produced
// by unverified logic, and expected values are never hand-edited.
//
//   npx vite-node scripts/generate-rb-snapshots.mts
//
// Re-run intentionally when model_version or reference_version changes; otherwise
// the committed snapshots are the contract that future code must reproduce.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateRunningBack } from '../src/rb-model/engine';
import { EXPECTED_DIR, PRIMARY_FIXTURES, loadFixture } from '../src/rb-model/testutil';

mkdirSync(EXPECTED_DIR, { recursive: true });

for (const name of PRIMARY_FIXTURES) {
  const output = evaluateRunningBack(loadFixture(name));
  const file = join(EXPECTED_DIR, `${name}.expected.json`);
  writeFileSync(file, JSON.stringify(output, null, 2) + '\n');
  console.log(`wrote ${file}`);
}
console.log('done');
