import { describe, expect, it } from "vitest";
import { evaluateQuarterback } from "../../src/qb-model/index.js";
import { QBValidationError } from "../../src/qb-model/errors.js";
import { FIXTURE_OPTIONS, baseInput } from "./helpers.js";
import type { QBEvaluatorOptions, QBMVPInput } from "../../src/qb-model/types.js";

const bad = (o: Partial<QBMVPInput>) =>
  () => evaluateQuarterback(baseInput(o), FIXTURE_OPTIONS);
const badOpt = (opt: unknown) =>
  () => evaluateQuarterback(baseInput(), opt as QBEvaluatorOptions);

/** Section 26.2.3 / 26.2.4 / 26.16.5 and 26.16.1 #18, #24. */
describe("input validation (26.2.3, 26.16.5)", () => {
  it("rejects negative counts", () => {
    expect(bad({ career_pass_attempts: -1 })).toThrow(QBValidationError);
    expect(bad({ recent_rush_attempts: -5 })).toThrow(QBValidationError);
  });

  it("rejects rates above 1", () => {
    expect(bad({ team_dropback_share: 1.2 })).toThrow(QBValidationError);
    expect(bad({ probability_active: 1.01 })).toThrow(QBValidationError);
  });

  it("rejects invalid enums", () => {
    expect(bad({ depth_chart_status: "MVP" as never })).toThrow(QBValidationError);
    expect(bad({ role_status: "GOAT" as never })).toThrow(QBValidationError);
    expect(bad({ injury_status: "SORE" as never })).toThrow(QBValidationError);
  });

  it("rejects career_starts > career_games_played", () => {
    expect(bad({ career_starts: 90, career_games_played: 80 })).toThrow(QBValidationError);
  });

  it("rejects recent_starts > recent_games", () => {
    expect(bad({ recent_starts: 8, recent_games: 4 })).toThrow(QBValidationError);
  });

  it("rejects relational passing overflows", () => {
    expect(bad({ recent_completions: 300, recent_pass_attempts: 280 })).toThrow(QBValidationError);
    expect(bad({ recent_passing_tds: 20, recent_interceptions: 270, recent_pass_attempts: 280 })).toThrow(
      QBValidationError
    );
  });

  it("rejects positive active probability for OUT/IR/PUP", () => {
    expect(bad({ injury_status: "OUT", probability_active: 0.5 })).toThrow(QBValidationError);
    expect(bad({ injury_status: "IR", probability_active: 0.1 })).toThrow(QBValidationError);
  });

  it("rejects out-of-range age, draft round, and games remaining", () => {
    expect(bad({ age: 19 })).toThrow(QBValidationError);
    expect(bad({ age: 51 })).toThrow(QBValidationError);
    expect(bad({ draft_round: 8 as never })).toThrow(QBValidationError);
    expect(bad({ expected_games_remaining: 22 })).toThrow(QBValidationError);
  });

  it("#18 no missing numeric value silently becomes zero (NaN is rejected)", () => {
    expect(bad({ recent_pass_attempts: Number.NaN })).toThrow(QBValidationError);
    expect(bad({ age: Number.POSITIVE_INFINITY })).toThrow(QBValidationError);
  });

  it("rejects unknown input properties and timezone-free timestamps", () => {
    expect(
      () =>
        evaluateQuarterback(
          { ...baseInput(), bogus_field: 1 } as unknown as QBMVPInput,
          FIXTURE_OPTIONS
        )
    ).toThrow(QBValidationError);
    expect(bad({ as_of: "2026-09-10T16:00:00" })).toThrow(QBValidationError);
  });

  it("permits negative passing and rushing yards", () => {
    expect(bad({ recent_passing_yards: -20, recent_rushing_yards: -5 })).not.toThrow();
  });
});

describe("scoring validation (26.2.4)", () => {
  it("rejects invalid scoring values and unknown keys", () => {
    expect(badOpt({ ...FIXTURE_OPTIONS, scoring: { points_per_passing_yard: 0.5 } })).toThrow(
      QBValidationError
    );
    expect(badOpt({ ...FIXTURE_OPTIONS, scoring: { points_per_interception: 2 } })).toThrow(
      QBValidationError
    );
    expect(badOpt({ ...FIXTURE_OPTIONS, scoring: { bonus: 1 } })).toThrow(QBValidationError);
  });

  it("allows partial overrides with defaults for missing keys", () => {
    const out = evaluateQuarterback(baseInput(), {
      ...FIXTURE_OPTIONS,
      scoring: { points_per_completion: 1 },
    });
    expect(out.scoring.points_per_completion).toBe(1);
    expect(out.scoring.points_per_passing_yard).toBe(0.04);
  });
});

describe("option validation (26.1, 26.16.1 #24)", () => {
  it("rejects invalid selected horizons", () => {
    expect(badOpt({ ...FIXTURE_OPTIONS, selected_horizon: "MONTHLY" })).toThrow(QBValidationError);
  });
  it("rejects empty model versions", () => {
    expect(badOpt({ ...FIXTURE_OPTIONS, model_version: "   " })).toThrow(QBValidationError);
  });
  it("rejects unknown option keys", () => {
    expect(badOpt({ ...FIXTURE_OPTIONS, surprise: true })).toThrow(QBValidationError);
  });
  it("rejects invalid generated timestamps", () => {
    expect(badOpt({ ...FIXTURE_OPTIONS, generated_at: "not-a-time" })).toThrow(QBValidationError);
    expect(badOpt({ ...FIXTURE_OPTIONS, generated_at: "2026-09-10T22:00:00" })).toThrow(
      QBValidationError
    );
  });
  it("rejects array or null options object", () => {
    expect(badOpt([])).toThrow(QBValidationError);
  });
  it("emits the trimmed model version", () => {
    const out = evaluateQuarterback(baseInput(), { ...FIXTURE_OPTIONS, model_version: "  qb-fork-9  " });
    expect(out.model_version).toBe("qb-fork-9");
  });
});
