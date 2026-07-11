import { describe, expect, it } from "vitest";
import { resolveFallbacks } from "../../src/qb-model/fallbacks.js";
import { evaluateQuarterback } from "../../src/qb-model/index.js";
import { lexicalSort, unique } from "../../src/qb-model/math.js";
import { FIXTURE_OPTIONS, baseInput, evalFixture } from "./helpers.js";
import type { QBMVPInput } from "../../src/qb-model/types.js";

/** All nullable fields null (missing-data profile) for fallback coverage. */
function missingInput(overrides: Partial<QBMVPInput> = {}): QBMVPInput {
  return baseInput({
    designed_rush_attempts: null,
    scrambles: null,
    goal_line_rush_attempts: null,
    adjusted_yards_per_attempt: null,
    completion_percentage_over_expected: null,
    explosive_pass_rate: null,
    team_dropback_share: null,
    expected_active_game_pass_attempts: null,
    expected_active_game_designed_rush_attempts: null,
    expected_active_game_scrambles: null,
    expected_active_game_goal_line_rush_attempts: null,
    offensive_environment_score: null,
    protection_context_score: null,
    competition_pressure: null,
    organizational_commitment: null,
    probability_active: null,
    expected_games_limited: null,
    ...overrides,
  });
}

/** Section 26.5 fallbacks and 26.16.1 #20. */
describe("fallback resolution (26.5)", () => {
  it("supplied values produce no fallback codes", () => {
    const { codes } = resolveFallbacks(baseInput());
    expect(codes).toHaveLength(0);
  });

  it("resolves every nullable field with its exact fallback code", () => {
    const { codes } = resolveFallbacks(missingInput());
    const expected = [
      "SCRAMBLES_FROM_RUSH_SHARE",
      "DESIGNED_RUSH_FROM_TOTAL_MINUS_SCRAMBLES",
      "GOAL_LINE_RUSH_FROM_TOTAL",
      "AYPA_DERIVED",
      "CPOE_TO_COMPLETION_RATE",
      "EXPLOSIVE_PASS_RATE_PRIOR",
      "DROPBACK_SHARE_FROM_DEPTH_CHART",
      "EXPECTED_DESIGNED_RUSH_FALLBACK",
      "EXPECTED_SCRAMBLES_FALLBACK",
      "EXPECTED_GOAL_LINE_RUSH_FALLBACK",
      "OFFENSIVE_ENVIRONMENT_NEUTRAL",
      "PROTECTION_CONTEXT_NEUTRAL",
      "COMPETITION_FROM_ROLE",
      "COMMITMENT_FROM_ROLE_DRAFT",
      "ACTIVE_PROBABILITY_FROM_INJURY",
      "LIMITED_GAMES_FROM_INJURY",
    ];
    // expected_active_game_pass_attempts also falls back (starts > 0 path).
    expect(codes).toContain("PASS_ATTEMPTS_FROM_RECENT_STARTS");
    for (const code of expected) expect(codes).toContain(code);
  });

  it("AY/A falls back to the prior when no attempts exist", () => {
    const { codes, resolved } = resolveFallbacks(
      missingInput({
        recent_games: 0,
        recent_starts: 0,
        recent_pass_attempts: 0,
        recent_completions: 0,
        recent_passing_tds: 0,
        recent_interceptions: 0,
        recent_sacks: 0,
        recent_rush_attempts: 0,
        recent_rushing_yards: 0,
        recent_rushing_tds: 0,
      })
    );
    expect(codes).toContain("AYPA_PRIOR");
    expect(resolved.adjusted_yards_per_attempt).toBe(6.8);
    expect(codes).toContain("PASS_ATTEMPTS_FROM_ROLE");
  });

  it("#20 output fallback log is de-duplicated and lexically sorted", () => {
    const out = evaluateQuarterback(missingInput(), FIXTURE_OPTIONS);
    expect(out.fallback_log).toEqual(lexicalSort(unique(out.fallback_log)));
  });

  it("derives fallback status from unique fallback count (26.5.10)", () => {
    expect(evaluateQuarterback(baseInput(), FIXTURE_OPTIONS).status).toBe("COMPLETE");
    const partial = evaluateQuarterback(
      baseInput({ offensive_environment_score: null, protection_context_score: null }),
      FIXTURE_OPTIONS
    );
    expect(partial.status).toBe("PARTIAL");
    expect(evalFixture("QB-G12").status).toBe("FALLBACK_HEAVY");
  });
});
