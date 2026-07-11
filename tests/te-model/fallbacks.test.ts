import { describe, expect, it } from "vitest";
import { resolveCanonicalValues, workloadRampLookup } from "../../src/te-model/fallbacks.js";
import { computePriors } from "../../src/te-model/priors.js";
import {
  resolveReference,
  TE_MVP_V1_REFERENCE_DISTRIBUTIONS,
} from "../../src/te-model/references.js";
import { shrunkTprr } from "../../src/te-model/shrinkage.js";
import { evaluateTightEnd } from "../../src/te-model/index.js";
import type { TEMVPInput } from "../../src/te-model/types.js";
import { baseInput, missingDataInput } from "./helpers.js";

function resolve(input: TEMVPInput) {
  return resolveCanonicalValues(input, computePriors(input), resolveReference(undefined));
}

function entryFor(input: TEMVPInput, field: string) {
  return resolve(input).entries.filter((e) => e.field === field);
}

describe("fallback rows (26.5.2 / 26.5.8)", () => {
  it("RP4 missing uses original RP8 (cross-window, penalty 15)", () => {
    const input = baseInput({ route_participation_last4: null });
    const { canonical, entries } = resolve(input);
    expect(canonical.rp4).toBe(0.68);
    expect(entries).toEqual([
      { field: "RP4", fallback_used: "RP8_CROSS_WINDOW", confidence_penalty: 15 },
    ]);
  });

  it("RP8 missing uses original RP4 (cross-window, penalty 12)", () => {
    const input = baseInput({ route_participation_last8: null });
    const { canonical, entries } = resolve(input);
    expect(canonical.rp8).toBe(0.7);
    expect(entries).toEqual([
      { field: "RP8", fallback_used: "RP4_CROSS_WINDOW", confidence_penalty: 12 },
    ]);
  });

  it("both route windows missing with snap share → snap proxy for both, penalties 15 and 12, no extra proxy penalty", () => {
    const input = baseInput({
      route_participation_last4: null,
      route_participation_last8: null,
      snap_share_last4: 0.9,
    });
    const { canonical, entries } = resolve(input);
    const proxy = Math.min(0.9 * 0.72, 0.85);
    expect(canonical.rp4).toBeCloseTo(proxy, 12);
    expect(canonical.rp8).toBeCloseTo(proxy, 12);
    expect(entries).toEqual([
      { field: "RP4", fallback_used: "SNAP_SHARE_PROXY", confidence_penalty: 15 },
      { field: "RP8", fallback_used: "SNAP_SHARE_PROXY", confidence_penalty: 12 },
    ]);
  });

  it("snap proxy formula is clamp(Snap4 × 0.72, 0, 0.85)", () => {
    // With valid snap share ≤ 1 the proxy tops out at 0.72, inside the 0.85 cap;
    // the cap is a defensive bound of the binding formula.
    const input = baseInput({
      route_participation_last4: null,
      route_participation_last8: null,
      snap_share_last4: 1.0,
    });
    expect(resolve(input).canonical.rp4).toBeCloseTo(0.72, 12);
  });

  it("no route data at all → fixed 0.50 for both windows", () => {
    const input = baseInput({
      route_participation_last4: null,
      route_participation_last8: null,
      snap_share_last4: null,
    });
    const { canonical, entries } = resolve(input);
    expect(canonical.rp4).toBe(0.5);
    expect(canonical.rp8).toBe(0.5);
    expect(entries.slice(0, 3)).toEqual([
      { field: "RP4", fallback_used: "FIXED_0.50", confidence_penalty: 15 },
      { field: "RP8", fallback_used: "FIXED_0.50", confidence_penalty: 12 },
      { field: "SNAP4", fallback_used: "ROUTE_PARTICIPATION_PROXY", confidence_penalty: 6 },
    ]);
  });

  it("mutual RP4/RP8 fallbacks use original values, never fallback-generated ones", () => {
    // RP4 null, RP8 null, Snap4 present: RP4 must come from Snap4, not from the
    // fallback-generated RP8 (and vice versa) — both equal the snap proxy directly.
    const input = baseInput({
      route_participation_last4: null,
      route_participation_last8: null,
      snap_share_last4: 0.6,
    });
    const { canonical } = resolve(input);
    expect(canonical.rp4).toBeCloseTo(0.432, 12);
    expect(canonical.rp8).toBeCloseTo(0.432, 12);
  });

  it("Snap4 missing uses max(canonical RP4, RP8)/0.80 clamped to [0,1]", () => {
    const input = baseInput({ snap_share_last4: null });
    const { canonical, entries } = resolve(input);
    expect(canonical.snap4).toBeCloseTo(0.7 / 0.8, 12);
    expect(entries).toEqual([
      { field: "SNAP4", fallback_used: "ROUTE_PARTICIPATION_PROXY", confidence_penalty: 6 },
    ]);
    const high = baseInput({ snap_share_last4: null, route_participation_last4: 0.9 });
    expect(resolve(high).canonical.snap4).toBe(1);
  });

  it("TPRR missing uses non-overlapping career TPRR then draft/prospect prior", () => {
    const career = baseInput({ targets_per_route_run: null });
    expect(resolve(career).canonical.tprr).toBe(0.18);
    expect(entryFor(career, "TPRR")).toEqual([
      { field: "TPRR", fallback_used: "CAREER_TPRR", confidence_penalty: 10 },
    ]);
    const prior = baseInput({
      targets_per_route_run: null,
      career_targets_per_route_run: null,
      draft_round: 1,
      prospect_type: "RECEIVING",
    });
    expect(resolve(prior).canonical.tprr).toBeCloseTo(0.22, 12);
    expect(entryFor(prior, "TPRR")).toEqual([
      { field: "TPRR", fallback_used: "DRAFT_PROSPECT_PRIOR", confidence_penalty: 10 },
    ]);
  });

  it("target-share fallback uses canonical RP4 × shrunk_TPRR × 0.92 capped at 0.30", () => {
    const input = baseInput({ target_share: null });
    const { canonical, entries, shrunk_tprr } = resolve(input);
    const expected = Math.min(0.7 * shrunk_tprr * 0.92, 0.3);
    expect(canonical.target_share).toBeCloseTo(expected, 12);
    expect(entries).toEqual([
      { field: "TARGET_SHARE", fallback_used: "RP4_SHRUNK_TPRR_PROXY", confidence_penalty: 6 },
    ]);
  });

  it("target-share fallback never uses unshrunk canonical TPRR", () => {
    // Small career sample: shrunk TPRR differs materially from raw TPRR.
    const input = baseInput({
      target_share: null,
      career_routes: 50,
      career_targets: 12,
      targets_per_route_run: 0.3,
      draft_round: 7,
      prospect_type: "BLOCKING_FIRST",
    });
    const priors = computePriors(input);
    const expectedShrunk = shrunkTprr(0.3, 50, priors.draft_prospect_tprr_prior);
    const { canonical } = resolve(input);
    expect(canonical.target_share).toBeCloseTo(
      Math.min(0.7 * expectedShrunk * 0.92, 0.3),
      12
    );
    const unshrunkValue = Math.min(0.7 * 0.3 * 0.92, 0.3);
    expect(canonical.target_share).not.toBeCloseTo(unshrunkValue, 6);
  });

  it("regression: target-share fallback works on a cold session with TPRR also missing", () => {
    // TPRR itself falls back to the draft/prospect prior, is then shrunk, and only then
    // feeds the target-share proxy — the Section 26.5.3 dependency order.
    const input = baseInput({
      target_share: null,
      targets_per_route_run: null,
      career_targets_per_route_run: null,
      career_routes: 0,
      career_targets: 0,
      draft_round: 3,
      prospect_type: "BALANCED",
    });
    const { canonical, shrunk_tprr } = resolve(input);
    // career_routes = 0 → shrunk TPRR equals the prior exactly (0.185).
    expect(shrunk_tprr).toBeCloseTo(0.185, 12);
    expect(canonical.target_share).toBeCloseTo(Math.min(0.7 * 0.185 * 0.92, 0.3), 12);
  });

  it("aDOT missing uses fixed 7.5 with penalty 3", () => {
    const input = baseInput({ average_depth_of_target: null });
    const { canonical, entries } = resolve(input);
    expect(canonical.average_depth_of_target).toBe(7.5);
    expect(entries).toEqual([
      { field: "AVERAGE_DEPTH_OF_TARGET", fallback_used: "FIXED_7.50", confidence_penalty: 3 },
    ]);
  });

  it("red-zone rate: career then fixed 0.18", () => {
    const career = baseInput({ red_zone_target_rate: null });
    expect(resolve(career).canonical.red_zone_target_rate).toBe(0.19);
    expect(entryFor(career, "RED_ZONE_TARGET_RATE")[0]!.fallback_used).toBe(
      "CAREER_RED_ZONE_TARGET_RATE"
    );
    const fixed = baseInput({
      red_zone_target_rate: null,
      career_red_zone_target_rate: null,
    });
    expect(resolve(fixed).canonical.red_zone_target_rate).toBe(0.18);
    expect(entryFor(fixed, "RED_ZONE_TARGET_RATE")[0]!.fallback_used).toBe("FIXED_0.18");
  });

  it("end-zone rate: career then fixed 0.08", () => {
    const fixed = baseInput({
      end_zone_target_rate: null,
      career_end_zone_target_rate: null,
    });
    expect(resolve(fixed).canonical.end_zone_target_rate).toBe(0.08);
    expect(entryFor(fixed, "END_ZONE_TARGET_RATE")[0]!.fallback_used).toBe("FIXED_0.08");
  });

  it("catchable rate missing uses the QB mapping with the canonical QB score", () => {
    const input = baseInput({ catchable_target_rate: null, qb_environment_score: 80 });
    const { canonical, entries } = resolve(input);
    expect(canonical.catchable_target_rate).toBeCloseTo(0.66 + 0.002 * 80, 12);
    expect(entries).toEqual([
      { field: "CATCHABLE_TARGET_RATE", fallback_used: "QB_ENVIRONMENT_PROXY", confidence_penalty: 6 },
    ]);
  });

  it("QB mapping clamps to [0.66, 0.86] and uses the QB fallback of 50 when both missing", () => {
    const low = baseInput({ catchable_target_rate: null, qb_environment_score: 0 });
    expect(resolve(low).canonical.catchable_target_rate).toBe(0.66);
    const high = baseInput({ catchable_target_rate: null, qb_environment_score: 100 });
    expect(resolve(high).canonical.catchable_target_rate).toBe(0.86);
    const both = baseInput({ catchable_target_rate: null, qb_environment_score: null });
    const { canonical, entries } = resolve(both);
    expect(canonical.catchable_target_rate).toBeCloseTo(0.76, 12);
    // Both fields logged and penalized independently.
    expect(entries).toEqual([
      { field: "CATCHABLE_TARGET_RATE", fallback_used: "QB_ENVIRONMENT_PROXY", confidence_penalty: 6 },
      { field: "QB_ENVIRONMENT_SCORE", fallback_used: "FIXED_50", confidence_penalty: 6 },
    ]);
  });

  it("catch rate, YPT, YPR, YAC: career then fixed neutral values", () => {
    const fixed = baseInput({
      catch_rate: null,
      career_catch_rate: null,
      yards_per_target: null,
      career_yards_per_target: null,
      yards_per_reception: null,
      career_yards_per_reception: null,
      yac_per_reception: null,
      career_yac_per_reception: null,
    });
    const { canonical, entries } = resolve(fixed);
    expect(canonical.catch_rate).toBe(0.68);
    expect(canonical.yards_per_target).toBe(7.2);
    expect(canonical.yards_per_reception).toBe(10.6);
    expect(canonical.yac_per_reception).toBe(4.6);
    expect(entries).toEqual([
      { field: "CATCH_RATE", fallback_used: "FIXED_0.68", confidence_penalty: 5 },
      { field: "YARDS_PER_TARGET", fallback_used: "FIXED_7.20", confidence_penalty: 5 },
      { field: "YARDS_PER_RECEPTION", fallback_used: "FIXED_10.60", confidence_penalty: 5 },
      { field: "YAC_PER_RECEPTION", fallback_used: "FIXED_4.60", confidence_penalty: 5 },
    ]);
  });

  it("career efficiency values are used when current values are missing", () => {
    const career = baseInput({ catch_rate: null });
    expect(resolve(career).canonical.catch_rate).toBe(0.69);
    expect(entryFor(career, "CATCH_RATE")[0]!.fallback_used).toBe("CAREER_CATCH_RATE");
  });

  it("team environment fields use the reference median (bundled reference)", () => {
    const input = baseInput({
      projected_team_dropbacks: null,
      team_points_per_drive: null,
      team_red_zone_trips_per_game: null,
    });
    const { canonical, entries } = resolve(input);
    expect(canonical.projected_team_dropbacks).toBe(34.25);
    expect(canonical.team_points_per_drive).toBe(2.08);
    expect(canonical.team_red_zone_trips_per_game).toBe(3.25);
    expect(entries).toEqual([
      { field: "PROJECTED_TEAM_DROPBACKS", fallback_used: "REFERENCE_MEDIAN", confidence_penalty: 5 },
      { field: "TEAM_POINTS_PER_DRIVE", fallback_used: "REFERENCE_MEDIAN", confidence_penalty: 5 },
      { field: "TEAM_RED_ZONE_TRIPS_PER_GAME", fallback_used: "REFERENCE_MEDIAN", confidence_penalty: 5 },
    ]);
  });

  it("team environment fields use the fixed final fallback when the runtime distribution is missing", () => {
    const custom = {
      ...TE_MVP_V1_REFERENCE_DISTRIBUTIONS,
      reference_version: "TE_REFERENCE_MISSING_ENV_TEST",
    } as unknown as Record<string, unknown>;
    delete custom["projected_team_dropbacks"];
    delete custom["team_points_per_drive"];
    delete custom["team_red_zone_trips_per_game"];
    const input = baseInput({
      projected_team_dropbacks: null,
      team_points_per_drive: null,
      team_red_zone_trips_per_game: null,
    });
    const { canonical, entries } = resolveCanonicalValues(
      input,
      computePriors(input),
      resolveReference(custom as never)
    );
    expect(canonical.projected_team_dropbacks).toBe(34.0);
    expect(canonical.team_points_per_drive).toBe(1.9);
    expect(canonical.team_red_zone_trips_per_game).toBe(3.2);
    expect(entries).toEqual([
      { field: "PROJECTED_TEAM_DROPBACKS", fallback_used: "FIXED_34.00", confidence_penalty: 5 },
      { field: "TEAM_POINTS_PER_DRIVE", fallback_used: "FIXED_1.90", confidence_penalty: 5 },
      { field: "TEAM_RED_ZONE_TRIPS_PER_GAME", fallback_used: "FIXED_3.20", confidence_penalty: 5 },
    ]);
  });

  it("competition pressure missing → 0.50 with penalty 4", () => {
    const input = baseInput({ competition_pressure: null });
    const { canonical, entries } = resolve(input);
    expect(canonical.competition_pressure).toBe(0.5);
    expect(entries).toEqual([
      { field: "COMPETITION_PRESSURE", fallback_used: "FIXED_0.50", confidence_penalty: 4 },
    ]);
  });

  it("contract security missing → draft-round mapping", () => {
    for (const [round, expected] of [
      [1, 1.0],
      [2, 0.82],
      [3, 0.65],
      [4, 0.45],
      [5, 0.45],
      [6, 0.26],
      [7, 0.26],
    ] as const) {
      const input = baseInput({
        contract_security: null,
        draft_round: round as TEMVPInput["draft_round"],
      });
      const { canonical, entries } = resolve(input);
      expect(canonical.contract_security).toBe(expected);
      expect(entries).toEqual([
        { field: "CONTRACT_SECURITY", fallback_used: "DRAFT_ROUND_MAPPING", confidence_penalty: 4 },
      ]);
    }
    const undrafted = baseInput({ contract_security: null, draft_round: null });
    expect(resolve(undrafted).canonical.contract_security).toBe(0.2);
  });

  it("workload ramp missing → status/practice lookup with penalty 4", () => {
    const input = baseInput({ workload_ramp_factor: null });
    const { canonical, entries } = resolve(input);
    expect(canonical.workload_ramp_factor).toBe(1.0);
    expect(entries).toEqual([
      { field: "WORKLOAD_RAMP_FACTOR", fallback_used: "STATUS_PRACTICE_MAPPING", confidence_penalty: 4 },
    ]);
  });

  it("workload-ramp lookup table matches 26.5.5 exactly", () => {
    const lookup = (
      injury: TEMVPInput["injury_status"],
      practice: TEMVPInput["practice_status"]
    ) => workloadRampLookup(baseInput({ injury_status: injury, practice_status: practice }));
    expect(lookup("HEALTHY", "FULL")).toBe(1.0);
    expect(lookup("QUESTIONABLE", "FULL")).toBe(0.9);
    expect(lookup("QUESTIONABLE", "LIMITED")).toBe(0.8);
    expect(lookup("QUESTIONABLE", "DNP")).toBe(0.7);
    expect(lookup("QUESTIONABLE", "UNKNOWN")).toBe(0.7);
    expect(lookup("DOUBTFUL", "FULL")).toBe(0.6);
    expect(lookup("OUT", "DNP")).toBe(0.0);
    expect(lookup("IR", "DNP")).toBe(0.0);
    expect(lookup("PUP", "DNP")).toBe(0.0);
    expect(lookup("SUSPENDED", "DNP")).toBe(0.0);
    expect(lookup("UNKNOWN", "FULL")).toBe(0.8);
  });
});

describe("fallback semantics (26.5.1 / 26.16.3)", () => {
  it("every missing canonical field logs once and penalizes once (missing-data profile)", () => {
    const out = evaluateTightEnd(missingDataInput());
    const fields = out.fallback_log.map((e) => e.field);
    expect(new Set(fields).size).toBe(fields.length);
    expect(fields).toEqual([
      "RP4",
      "RP8",
      "SNAP4",
      "TPRR",
      "TARGET_SHARE",
      "AVERAGE_DEPTH_OF_TARGET",
      "RED_ZONE_TARGET_RATE",
      "END_ZONE_TARGET_RATE",
      "CATCHABLE_TARGET_RATE",
      "CATCH_RATE",
      "YARDS_PER_TARGET",
      "YARDS_PER_RECEPTION",
      "YAC_PER_RECEPTION",
      "PROJECTED_TEAM_DROPBACKS",
      "TEAM_POINTS_PER_DRIVE",
      "TEAM_RED_ZONE_TRIPS_PER_GAME",
      "QB_ENVIRONMENT_SCORE",
      "COMPETITION_PRESSURE",
      "CONTRACT_SECURITY",
      "WORKLOAD_RAMP_FACTOR",
    ]);
    expect(out.status).toBe("PARTIAL");
  });

  it("no missing value becomes a silent zero", () => {
    const out = evaluateTightEnd(missingDataInput({ injury_status: "HEALTHY" }));
    expect(out.weekly.expected_routes).toBeGreaterThan(0);
    expect(out.weekly.expected_targets).toBeGreaterThan(0);
    expect(out.weekly.expected_fantasy_points).toBeGreaterThan(0);
  });

  it("missing previous trend history is neutral: no fallback entry, no penalty, no PARTIAL", () => {
    const out = evaluateTightEnd(
      baseInput({ previous_route_participation: null, previous_targets_per_route_run: null })
    );
    expect(out.status).toBe("OK");
    expect(out.fallback_log).toHaveLength(0);
    expect(out.confidence.penalties).toHaveLength(0);
  });

  it("chained fallbacks are not order-dependent (same output for same input, repeated)", () => {
    const a = evaluateTightEnd(missingDataInput());
    const b = evaluateTightEnd(missingDataInput());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
