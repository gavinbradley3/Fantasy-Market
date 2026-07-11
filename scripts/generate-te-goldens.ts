/**
 * Golden-output generator (Section 26.16.8).
 *
 * Evaluates every fixture input with default options against the bundled
 * TE_REFERENCE_V1 and writes the complete serialized output to
 * fixtures/te/expected/<name>.json. Run only after formula tests pass:
 *
 *   npm run generate:te-goldens
 *
 * Golden files must never be hand-edited. Any intentional formula or constant change
 * requires a new model_version and regenerated goldens.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateTightEnd } from "../src/te-model/index.js";
import type { TEMVPInput } from "../src/te-model/types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = join(ROOT, "fixtures", "te");
const EXPECTED_DIR = join(FIXTURE_DIR, "expected");

const FIXTURE_NAMES = [
  "elite-receiving-focal-point",
  "full-time-balanced",
  "blocking-heavy-starter",
  "red-zone-specialist",
  "low-route-high-tprr",
  "young-breakout",
  "committee-tight-end",
  "aging-veteran",
  "injury-return",
  "out-player",
  "missing-data",
  "equal-snaps-low-routes",
  "equal-snaps-high-routes",
] as const;

mkdirSync(EXPECTED_DIR, { recursive: true });

for (const name of FIXTURE_NAMES) {
  const input = JSON.parse(
    readFileSync(join(FIXTURE_DIR, `${name}.json`), "utf8")
  ) as TEMVPInput;
  const output = evaluateTightEnd(input);
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  writeFileSync(join(EXPECTED_DIR, `${name}.json`), serialized, "utf8");
  console.log(
    `${name}: weekly_efo=${output.weekly.expected_fantasy_points} ros_efo=${output.ros.expected_fantasy_points} ` +
      `confidence=${output.confidence.score}(${output.confidence.label}) ` +
      `volatility=${output.volatility.score}(${output.volatility.label}) status=${output.status} ` +
      `fallbacks=${output.fallback_log.length}`
  );
}
console.log("golden outputs written to fixtures/te/expected/");
