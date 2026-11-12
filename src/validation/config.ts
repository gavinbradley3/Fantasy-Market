// Experiment configuration: everything that defines a backtest, archived beside its results.

export interface ExperimentConfig {
  readonly name: string;
  readonly description: string;
  /** Directory holding the nflverse files the harness reads (see scripts/backtest/fetch-data.ts). */
  readonly dataDir: string;
  /** Capture store for the PlayerTicker pipeline runs. */
  readonly capturesDir: string;
  /**
   * Give each decision date its own empty capture store (capturesDir/<id>). Required for a valid
   * replay: on a 304 the transport reuses a cached envelope verbatim, including the effective
   * date of whichever run first fetched it, and the pipeline derives age and seasons completed
   * from that date (phase2-baseline-v1 replayed every date with October 2019 ages).
   */
  readonly isolateCaptures?: boolean;
  /**
   * Read frozen PlayerTicker predictions from another experiment's predictions directory
   * instead of this one's. A challenger experiment scores new models against the SAME frozen
   * boards, so it points here rather than copying or regenerating them.
   */
  readonly predictionsFrom?: string;
  /**
   * Also score the research challengers (src/validation/challengers.ts): F and the two
   * value-layer-only variants of the incumbent. Off by default, so an experiment that does not
   * ask for them produces byte-identical results to before they existed.
   */
  readonly challengers?: boolean;
  /**
   * Set once an experiment's results are frozen. The evaluator then recomputes, compares the
   * result hash with this value, writes nothing, and exits non-zero on any difference. A frozen
   * experiment can be re-verified but never overwritten. A changed model is a new experiment.
   */
  readonly frozenResultsSha256?: string;
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
