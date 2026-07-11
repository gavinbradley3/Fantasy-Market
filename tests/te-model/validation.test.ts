import { describe, expect, it } from "vitest";
import { evaluateTightEnd, TEValidationError } from "../../src/te-model/index.js";
import type { TEMVPInput } from "../../src/te-model/types.js";
import { baseInput, missingDataInput } from "./helpers.js";

function rejects(overrides: Partial<TEMVPInput>): void {
  expect(() => evaluateTightEnd(baseInput(overrides))).toThrow(TEValidationError);
}

describe("input validation (26.2.2 / 26.16.5)", () => {
  it("accepts the valid baseline", () => {
    expect(evaluateTightEnd(baseInput()).status).toBe("OK");
  });

  it("rejects empty identity strings", () => {
    rejects({ player_id: "" });
    rejects({ player_id: "   " });
    rejects({ player_name: "" });
    rejects({ player_name: " \t " });
  });

  it("rejects invalid age", () => {
    rejects({ age: 17 });
    rejects({ age: 46 });
    rejects({ age: 26.5 });
    rejects({ age: Number.NaN });
    rejects({ age: null as unknown as number });
  });

  it("rejects invalid seasons and career counts", () => {
    rejects({ nfl_seasons_completed: -1 });
    rejects({ nfl_seasons_completed: 2.5 });
    rejects({ career_routes: -1 });
    rejects({ career_routes: 10.5 });
    rejects({ career_targets: -5 });
    rejects({ career_targets: 3.3 });
  });

  it("rejects negative expected games remaining, accepts fractional", () => {
    rejects({ expected_games_remaining: -0.5 });
    expect(
      evaluateTightEnd(baseInput({ expected_games_remaining: 6.5 })).status
    ).toBe("OK");
  });

  it("rejects rates outside [0,1] for every declared rate field", () => {
    const rateFields: (keyof TEMVPInput)[] = [
      "route_participation_last4",
      "route_participation_last8",
      "snap_share_last4",
      "targets_per_route_run",
      "target_share",
      "red_zone_target_rate",
      "end_zone_target_rate",
      "catchable_target_rate",
      "catch_rate",
      "competition_pressure",
      "contract_security",
      "previous_route_participation",
      "previous_targets_per_route_run",
      "career_targets_per_route_run",
      "career_catch_rate",
      "career_red_zone_target_rate",
      "career_end_zone_target_rate",
    ];
    for (const field of rateFields) {
      rejects({ [field]: -0.01 } as Partial<TEMVPInput>);
      rejects({ [field]: 1.01 } as Partial<TEMVPInput>);
    }
  });

  it("workload_ramp_factor outside [0,1] is clamped, not rejected", () => {
    const low = evaluateTightEnd(baseInput({ workload_ramp_factor: -0.5 }));
    expect(low.weekly.workload_ramp_factor).toBe(0);
    const high = evaluateTightEnd(baseInput({ workload_ramp_factor: 1.5 }));
    expect(high.weekly.workload_ramp_factor).toBe(1);
  });

  it("workload-ramp clamping causes no PARTIAL, penalty, or fallback entry", () => {
    const out = evaluateTightEnd(baseInput({ workload_ramp_factor: 1.5 }));
    expect(out.status).toBe("OK");
    expect(out.fallback_log).toHaveLength(0);
    expect(out.confidence.penalties).toHaveLength(0);
    expect(out.confidence.score).toBe(100);
  });

  it("rejects qb_environment_score outside [0,100]", () => {
    rejects({ qb_environment_score: -1 });
    rejects({ qb_environment_score: 101 });
  });

  it("rejects non-finite provided numerics", () => {
    rejects({ yards_per_target: Number.POSITIVE_INFINITY });
    rejects({ yards_per_reception: Number.NEGATIVE_INFINITY });
    rejects({ average_depth_of_target: Number.NaN });
    rejects({ workload_ramp_factor: Number.NaN });
  });

  it("rejects negative projection and volume inputs", () => {
    rejects({ projected_team_dropbacks: -1 });
    rejects({ team_points_per_drive: -0.1 });
    rejects({ team_red_zone_trips_per_game: -2 });
    rejects({ yards_per_target: -1 });
    rejects({ yards_per_reception: -1 });
    rejects({ yac_per_reception: -0.5 });
  });

  it("accepts negative average_depth_of_target", () => {
    expect(
      evaluateTightEnd(baseInput({ average_depth_of_target: -1.5 })).status
    ).toBe("OK");
  });

  it("rejects invalid enums and draft round", () => {
    rejects({ prospect_type: "SPEEDY" as TEMVPInput["prospect_type"] });
    rejects({ depth_chart_role: "TE9" as TEMVPInput["depth_chart_role"] });
    rejects({ role_change: "TRADED" as TEMVPInput["role_change"] });
    rejects({ coaching_continuity: "MAYBE" as TEMVPInput["coaching_continuity"] });
    rejects({ injury_status: "SORE" as TEMVPInput["injury_status"] });
    rejects({ practice_status: "PARTIAL" as TEMVPInput["practice_status"] });
    rejects({ draft_round: 8 as unknown as TEMVPInput["draft_round"] });
    rejects({ draft_round: 0 as unknown as TEMVPInput["draft_round"] });
  });

  it("rejects null or non-boolean required booleans", () => {
    rejects({ teammate_return_flag: null as unknown as boolean });
    rejects({ another_receiving_te_flag: undefined as unknown as boolean });
    rejects({ temporary_opportunity_flag: "yes" as unknown as boolean });
    rejects({ new_team_flag: 1 as unknown as boolean });
  });

  it("rejects invalid timestamps", () => {
    rejects({ as_of_timestamp: "" });
    rejects({ as_of_timestamp: "yesterday" });
    rejects({ as_of_timestamp: "2025-11-05" });
    rejects({ as_of_timestamp: "2025-11-05T12:00:00" });
    rejects({ as_of_timestamp: "2025-13-05T12:00:00Z" });
  });

  it("rejects negative or non-finite scoring constants", () => {
    rejects({
      scoring: {
        points_per_reception: -1,
        points_per_receiving_yard: 0.1,
        points_per_receiving_td: 6,
      },
    });
    rejects({
      scoring: {
        points_per_reception: 1,
        points_per_receiving_yard: Number.NaN,
        points_per_receiving_td: 6,
      },
    });
    rejects({
      scoring: {
        points_per_reception: 1,
        points_per_receiving_yard: 0.1,
        points_per_receiving_td: Number.POSITIVE_INFINITY,
      },
    });
  });

  it("rejects an invalid selected horizon", () => {
    expect(() =>
      evaluateTightEnd(baseInput(), {
        selected_horizon: "MONTHLY" as unknown as "WEEKLY",
      })
    ).toThrow(TEValidationError);
  });

  it("rejects an empty model_version", () => {
    expect(() => evaluateTightEnd(baseInput(), { model_version: "  " })).toThrow(
      TEValidationError
    );
  });

  it("rejects a custom reference object with empty reference_version", () => {
    expect(() =>
      evaluateTightEnd(baseInput(), {
        reference_distributions: {
          reference_version: "  ",
        } as never,
      })
    ).toThrow(TEValidationError);
  });

  it("accepts nullable fields that have documented fallbacks", () => {
    const out = evaluateTightEnd(missingDataInput());
    expect(out.status).toBe("PARTIAL");
  });

  it("rejects null team of wrong type but accepts null", () => {
    rejects({ team: 7 as unknown as string });
    expect(evaluateTightEnd(baseInput({ team: null })).status).toBe("OK");
  });

  it("trims identity and version strings before serialization", () => {
    const out = evaluateTightEnd(
      baseInput({ player_id: "  TE-TRIM-1 ", player_name: " Trim Me " }),
      { model_version: " te-mvp-1.0 " }
    );
    expect(out.player_id).toBe("TE-TRIM-1");
    expect(out.player_name).toBe("Trim Me");
    expect(out.model_version).toBe("te-mvp-1.0");
  });
});
