// CONFIDENCE CANNOT MOVE A VALUATION.
//
// The QB engine computes confidence at step 27, after components (13-20), composites (21) and
// projections (22-26), and feeds it into nothing. That ordering is the guarantee, but an
// ordering is easy to break by accident, so this file proves the property by experiment rather
// than by reading the code: drive the confidence inputs across their entire range and assert
// that every other field of the output is byte-identical.
//
// It is what makes a confidence-only correction safe to make at all. A change here that altered
// a composite would change the board's ranking, which is a different kind of change entirely
// and is not what any confidence fix is licensed to do.

import { describe, expect, it } from "vitest";
import { canonicalSerializeQBOutput, evaluateQuarterback } from "../../src/qb-model/index.js";
import { computeConfidence } from "../../src/qb-model/confidence.js";
import { FIXTURE_OPTIONS } from "../../scripts/generate-qb-goldens.js";
import type { QBMVPInput } from "../../src/qb-model/types.js";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE_DIR = join(ROOT, "fixtures", "qb");

function fixtures(): { name: string; input: QBMVPInput }[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      name: f.replace(/\.json$/, ""),
      input: JSON.parse(readFileSync(join(FIXTURE_DIR, f), "utf8")) as QBMVPInput,
    }));
}

/** The serialized output with the confidence object removed. */
function withoutConfidence(input: QBMVPInput): string {
  const parsed = JSON.parse(canonicalSerializeQBOutput(evaluateQuarterback(input, FIXTURE_OPTIONS)));
  delete parsed.confidence;
  return JSON.stringify(parsed);
}

describe("confidence is an output, never an input", () => {
  it("every golden fixture still evaluates, so the sweep below is over real inputs", () => {
    expect(fixtures().length).toBeGreaterThan(15);
  });

  it("the sample-evidence inputs move confidence and NOTHING else that is not already theirs", () => {
    // `career_starts` and `career_pass_attempts` are read by the confidence formula AND by the
    // career anchor, so they legitimately move components. `career_rush_attempts` is read by
    // confidence alone among these — changing it must therefore change confidence and leave the
    // entire rest of the output untouched.
    for (const { name, input } of fixtures()) {
      const low = withoutConfidence({ ...input, career_rush_attempts: 0 });
      const high = withoutConfidence({ ...input, career_rush_attempts: 4000 });
      expect(low, `${name}: career_rush_attempts moved something other than confidence`).toBe(high);
      const a = computeConfidence({ ...input, career_rush_attempts: 0 }, 0).score;
      const b = computeConfidence({ ...input, career_rush_attempts: 4000 }, 0).score;
      expect(b).toBeGreaterThanOrEqual(a);
    }
  });

  it("the fallback count no longer reaches confidence at all", () => {
    // The whole point of the correction. Every quarterback in the production pipeline resolves
    // the same 16 fallbacks, so a bucket keyed on that count was a constant subtracted from all
    // 81 of them — 20 points of coverage reported as if it were player evidence.
    for (const { name, input } of fixtures()) {
      const scores = [0, 1, 2, 3, 4, 5, 7, 8, 16, 40].map((n) => computeConfidence(input, n).score);
      const codes = [0, 16].map((n) => JSON.stringify(computeConfidence(input, n).codes.sort()));
      expect(new Set(scores).size, `${name}: fallback count still moves confidence`).toBe(1);
      expect(codes[0]).toBe(codes[1]);
    }
  });

  it("no surviving penalty code names a fallback", () => {
    for (const { name, input } of fixtures()) {
      for (const code of computeConfidence(input, 16).codes) {
        expect(code, `${name}`).not.toMatch(/^FALLBACK_/);
      }
    }
  });

  it("confidence still rises monotonically with observed evidence", () => {
    // The property a reader actually expects of the word: more of this player's own football
    // observed, never less confidence.
    const base = fixtures()[0]!.input;
    let previous = -1;
    for (const n of [0, 100, 250, 500, 1000, 1200, 3000]) {
      const score = computeConfidence({ ...base, career_pass_attempts: n }, 16).score;
      expect(score).toBeGreaterThanOrEqual(previous);
      previous = score;
    }
  });

  it("a saturated career can now reach HIGH, and an empty one cannot", () => {
    const base = fixtures()[0]!.input;
    const saturated = computeConfidence(
      {
        ...base,
        career_pass_attempts: 4000,
        career_starts: 120,
        recent_pass_attempts: 400,
        career_rush_attempts: 400,
        nfl_seasons_completed: 8,
        role_status: "ESTABLISHED_STARTER",
        team_change: false,
        major_system_change: false,
        recent_role_change: false,
        injury_status: "HEALTHY",
      },
      16,
    );
    expect(saturated.score).toBe(100);
    expect(saturated.codes).toEqual([]);
    const empty = computeConfidence(
      { ...base, career_pass_attempts: 0, career_starts: 0, recent_pass_attempts: 0, career_rush_attempts: 0 },
      16,
    );
    expect(empty.score).toBe(0);
  });
});
