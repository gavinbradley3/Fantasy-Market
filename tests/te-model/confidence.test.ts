import { describe, expect, it } from "vitest";
import { evaluateTightEnd } from "../../src/te-model/index.js";
import { baseInput, missingDataInput } from "./helpers.js";

describe("confidence (26.11)", () => {
  it("starts at 100 with no penalties for a complete profile", () => {
    const out = evaluateTightEnd(baseInput());
    expect(out.confidence.score).toBe(100);
    expect(out.confidence.penalties).toEqual([]);
    expect(out.confidence.label).toBe("HIGH");
  });

  it("career-route sample tiers are mutually exclusive with exact penalties", () => {
    expect(evaluateTightEnd(baseInput({ career_routes: 74 })).confidence.score).toBe(85);
    expect(
      evaluateTightEnd(baseInput({ career_routes: 74 })).confidence.penalties
    ).toEqual(["LOW_CAREER_ROUTES_LT_75"]);
    expect(evaluateTightEnd(baseInput({ career_routes: 75 })).confidence.score).toBe(90);
    expect(evaluateTightEnd(baseInput({ career_routes: 199 })).confidence.score).toBe(90);
    expect(evaluateTightEnd(baseInput({ career_routes: 200 })).confidence.score).toBe(94);
    expect(evaluateTightEnd(baseInput({ career_routes: 399 })).confidence.score).toBe(94);
    expect(evaluateTightEnd(baseInput({ career_routes: 400 })).confidence.score).toBe(100);
  });

  it("applies exact non-fallback penalties once each", () => {
    expect(
      evaluateTightEnd(baseInput({ injury_status: "UNKNOWN" })).confidence.score
    ).toBe(90);
    expect(evaluateTightEnd(baseInput({ role_change: "UNKNOWN" })).confidence.score).toBe(90);
    expect(
      evaluateTightEnd(baseInput({ depth_chart_role: "UNKNOWN" })).confidence.score
    ).toBe(92);
    expect(
      evaluateTightEnd(baseInput({ coaching_continuity: "UNKNOWN" })).confidence.score
    ).toBe(94);
    expect(evaluateTightEnd(baseInput({ new_team_flag: true })).confidence.score).toBe(92);
    expect(
      evaluateTightEnd(baseInput({ another_receiving_te_flag: true })).confidence.score
    ).toBe(94);
    expect(evaluateTightEnd(baseInput({ team: null })).confidence.score).toBe(95);
  });

  it("serializes penalty codes in the binding order: fallbacks, references, non-fallback rules", () => {
    const out = evaluateTightEnd(missingDataInput());
    const penalties = out.confidence.penalties;
    expect(penalties).toEqual([
      "FALLBACK:RP4",
      "FALLBACK:RP8",
      "FALLBACK:SNAP4",
      "FALLBACK:TPRR",
      "FALLBACK:TARGET_SHARE",
      "FALLBACK:AVERAGE_DEPTH_OF_TARGET",
      "FALLBACK:RED_ZONE_TARGET_RATE",
      "FALLBACK:END_ZONE_TARGET_RATE",
      "FALLBACK:CATCHABLE_TARGET_RATE",
      "FALLBACK:CATCH_RATE",
      "FALLBACK:YARDS_PER_TARGET",
      "FALLBACK:YARDS_PER_RECEPTION",
      "FALLBACK:YAC_PER_RECEPTION",
      "FALLBACK:PROJECTED_TEAM_DROPBACKS",
      "FALLBACK:TEAM_POINTS_PER_DRIVE",
      "FALLBACK:TEAM_RED_ZONE_TRIPS_PER_GAME",
      "FALLBACK:QB_ENVIRONMENT_SCORE",
      "FALLBACK:COMPETITION_PRESSURE",
      "FALLBACK:CONTRACT_SECURITY",
      "FALLBACK:WORKLOAD_RAMP_FACTOR",
      "LOW_CAREER_ROUTES_LT_75",
      "UNKNOWN_INJURY_STATUS",
      "UNKNOWN_ROLE_CHANGE",
      "UNKNOWN_DEPTH_CHART_ROLE",
      "UNKNOWN_COACHING_CONTINUITY",
      "MISSING_TEAM",
    ]);
    expect(new Set(penalties).size).toBe(penalties.length);
  });

  it("clamps to zero and labels LOW", () => {
    const out = evaluateTightEnd(missingDataInput());
    // Total penalties (123 fallback + 54 non-fallback) far exceed 100.
    expect(out.confidence.score).toBe(0);
    expect(out.confidence.label).toBe("LOW");
  });

  it("labels follow the rounded-score bands", () => {
    // 100 - 6 (coaching unknown) - 6 (another TE) - 8 (depth unknown) = 80 → HIGH edge.
    const high = evaluateTightEnd(
      baseInput({
        coaching_continuity: "UNKNOWN",
        another_receiving_te_flag: true,
        depth_chart_role: "UNKNOWN",
      })
    );
    expect(high.confidence.score).toBe(80);
    expect(high.confidence.label).toBe("HIGH");
    // 100 - 15 - 6 = 79 → MEDIUM edge.
    const medium = evaluateTightEnd(
      baseInput({ career_routes: 60, coaching_continuity: "UNKNOWN" })
    );
    expect(medium.confidence.score).toBe(79);
    expect(medium.confidence.label).toBe("MEDIUM");
  });

  it("confidence never changes projections, components, or composites", () => {
    // team is consumed by no formula — only the MISSING_TEAM confidence penalty.
    const noisy = evaluateTightEnd(baseInput({ team: null }));
    const clean = evaluateTightEnd(baseInput());
    expect(noisy.confidence.score).toBeLessThan(clean.confidence.score);
    expect(noisy.weekly).toEqual(clean.weekly);
    expect(noisy.ros).toEqual(clean.ros);
    expect(noisy.components).toEqual(clean.components);
    expect(noisy.composites).toEqual(clean.composites);
  });

  it("a fallback penalizes once even when its value feeds many downstream formulas", () => {
    const out = evaluateTightEnd(
      baseInput({
        route_participation_last4: null,
        route_participation_last8: null,
        snap_share_last4: 0.9,
      })
    );
    // RP4/RP8 proxies feed trends, components, projections, and volatility, but the
    // penalty list contains each code exactly once (15 + 12 = 27 total).
    expect(out.confidence.penalties).toEqual(["FALLBACK:RP4", "FALLBACK:RP8"]);
    expect(out.confidence.score).toBe(73);
  });
});
