// Experiment configuration: everything that defines a backtest, archived beside its results.

export interface ExperimentConfig {
  readonly name: string;
  readonly description: string;
  /** Directory holding the nflverse files the harness reads (see scripts/backtest/fetch-data.ts). */
  readonly dataDir: string;
  /** Shared capture store for the PlayerTicker pipeline runs. */
  readonly capturesDir: string;
  /** Scratch directory for pipeline databases; not archived. */
  readonly workDir: string;
  readonly decisions: readonly { readonly season: number; readonly checkpoint: string }[];
  /**
   * Chronological periods by DECISION season. The test period is sealed: the evaluator refuses
   * to compute or report it unless explicitly unsealed with a recorded reason.
   */
  readonly periods: {
    readonly development: readonly number[];
    readonly validation: readonly number[];
    readonly test: readonly number[];
  };
  /** League format the outcome targets are measured in. */
  readonly leagueSchemaId: string;
  readonly bootstrap: { readonly reps: number; readonly seed: number };
}
