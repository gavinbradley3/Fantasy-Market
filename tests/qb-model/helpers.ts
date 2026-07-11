import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateQuarterback } from "../../src/qb-model/index.js";
import type {
  QBEvaluatorOptions,
  QBMVPInput,
  QBMVPOutput,
} from "../../src/qb-model/types.js";

export const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "qb"
);
export const EXPECTED_DIR = join(FIXTURE_DIR, "expected");

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

export function loadFixtureInput(name: string): QBMVPInput {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), "utf8")) as QBMVPInput;
}

export function evalFixture(name: string): QBMVPOutput {
  return evaluateQuarterback(loadFixtureInput(name), FIXTURE_OPTIONS);
}

/**
 * Fully-specified, fallback-free, healthy baseline QB used by formula tests. Fictional
 * player; every value sits inside every reference range and supplies all nullable fields.
 */
export function baseInput(overrides: Partial<QBMVPInput> = {}): QBMVPInput {
  const base: QBMVPInput = {
    player_id: "QB-TEST-BASE",
    player_name: "Baseline Test Player",
    team: "TST",
    as_of: "2026-09-10T16:00:00-06:00",
    age: 27,
    nfl_seasons_completed: 5,
    draft_round: 1,
    career_games_played: 80,
    career_starts: 75,
    career_pass_attempts: 2500,
    career_rush_attempts: 300,
    recent_games: 8,
    recent_starts: 8,
    recent_pass_attempts: 280,
    recent_completions: 185,
    recent_passing_yards: 2100,
    recent_passing_tds: 16,
    recent_interceptions: 6,
    recent_sacks: 18,
    recent_rush_attempts: 48,
    recent_rushing_yards: 300,
    recent_rushing_tds: 4,
    designed_rush_attempts: 28,
    scrambles: 20,
    goal_line_rush_attempts: 8,
    adjusted_yards_per_attempt: 8.0,
    completion_percentage_over_expected: 0.025,
    explosive_pass_rate: 0.12,
    team_dropback_share: 0.96,
    expected_active_game_pass_attempts: 35,
    expected_active_game_designed_rush_attempts: 3.5,
    expected_active_game_scrambles: 2.5,
    expected_active_game_goal_line_rush_attempts: 1.0,
    offensive_environment_score: 70,
    protection_context_score: 65,
    depth_chart_status: "STARTER",
    role_status: "ESTABLISHED_STARTER",
    competition_pressure: 0.05,
    organizational_commitment: 0.93,
    probability_active: 0.99,
    injury_status: "HEALTHY",
    expected_games_remaining: 10,
    expected_games_limited: 0,
    team_change: false,
    major_system_change: false,
    recent_role_change: false,
    prior_recent_pass_attempts: 270,
    prior_adjusted_yards_per_attempt: 7.7,
    prior_interception_rate: 0.024,
    prior_rush_attempts_per_start: 5.5,
  };
  return { ...base, ...overrides };
}
