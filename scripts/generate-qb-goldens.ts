/**
 * QB golden-output generator (Section 26.16.7).
 *
 * Evaluates every fixture input with the binding fixture options against the bundled
 * QB_REFERENCE_V1 and writes the complete canonical serialized string to
 * fixtures/qb/expected/<name>.json. Run only after formula and audit-anchor tests pass:
 *
 *   npm run generate:qb-goldens
 *
 * Golden files must never be hand-edited to make a failing test pass. Any intentional
 * formula or constant change requires model-version review and regenerated goldens
 * (Section 26.16.7).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalSerializeQBOutput, evaluateQuarterback } from "../src/qb-model/index.js";
import type { QBEvaluatorOptions, QBMVPInput } from "../src/qb-model/types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = join(ROOT, "fixtures", "qb");
const EXPECTED_DIR = join(FIXTURE_DIR, "expected");

/** Binding fixture options (Section 26.16.6). */
export const FIXTURE_OPTIONS: QBEvaluatorOptions = {
  selected_horizon: "WEEKLY",
  scoring: {
    points_per_completion: 0,
    points_per_passing_yard: 0.04,
    points_per_passing_td: 4,
    points_per_interception: -2,
    points_per_rushing_yard: 0.1,
    points_per_rushing_td: 6,
  },
  model_version: "qb-mvp-1.2",
  generated_at: "2026-09-10T22:00:00.000Z",
};

export const FIXTURE_NAMES = [
  "QB-G01",
  "QB-G02",
  "QB-G03",
  "QB-G04",
  "QB-G05",
  "QB-G06",
  "QB-G07",
  "QB-G08",
  "QB-G09",
  "QB-G10",
  "QB-G11",
  "QB-G12",
  "QB-E01",
  "QB-E02",
  "QB-E03",
  "QB-G11-HEALTHY",
  "QB-E02-BASE",
  "QB-E03-HEALTHY",
  "QB-I01-A",
  "QB-I01-B",
  "QB-I02-A",
  "QB-I02-B",
  "QB-I03-A",
  "QB-I03-B",
] as const;

function main(): void {
  mkdirSync(EXPECTED_DIR, { recursive: true });
  for (const name of FIXTURE_NAMES) {
    const input = JSON.parse(
      readFileSync(join(FIXTURE_DIR, `${name}.json`), "utf8")
    ) as QBMVPInput;
    const output = evaluateQuarterback(input, FIXTURE_OPTIONS);
    const serialized = `${canonicalSerializeQBOutput(output)}\n`;
    writeFileSync(join(EXPECTED_DIR, `${name}.json`), serialized, "utf8");
    console.log(
      `${name}: weekly=${output.composites.weekly.toFixed(1)} ` +
        `weekly_efo=${output.expected_fantasy_output.weekly_fantasy_points.toFixed(1)} ` +
        `conf=${output.confidence.score.toFixed(1)}(${output.confidence.label}) ` +
        `vol=${output.volatility.score.toFixed(1)}(${output.volatility.label}) ` +
        `status=${output.status} fallbacks=${output.fallback_log.length}`
    );
  }
  console.log(`\ngolden outputs written to ${EXPECTED_DIR}`);
}

main();
