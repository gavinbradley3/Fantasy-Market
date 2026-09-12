// The production refresh pipeline.
//
// This is the ONE place the real systems are wired into the `RefreshPipeline` the scheduler
// and `POST /refresh` drive:
//
//   transport (`refreshSources`) → ingestion → inference → persistence
//   (`persistRefreshResult`) → publication (`store.publishBoard`)
//
// Every step calls the existing audited entry point. Nothing here re-implements transport,
// normalization, identity, evidence, inference, persistence or publication, and there is no
// separate code path for live data: a live run and a replay run differ only in the `mode`
// carried on the source plan, and both hand the identical envelope bytes to the identical
// adapter boundary.
//
// It lives outside `src/application` and `src/api` on purpose. Those layers are forbidden
// from importing `@/transport` and `@/ingestion` so they stay provider-agnostic, and the
// composition root keeps the pipeline INJECTED for exactly that reason. This module is the
// injected implementation: Node-only, never reachable from the browser bundle (proven by
// ./boundary.test.ts), and the only module that sees both ends of the stack.

import {
  buildDefaultRegistry,
  defaultTransportConfig,
  HttpClient,
  refreshSources,
  systemClock,
  type Clock,
  type RawPayloadStore,
  type RefreshResult,
  type TransportConfig,
} from '@/transport';
import type { BuildInputOptions, NormalizedSnapshot } from '@/ingestion';
import { persistRefreshResult, type PersistenceStore } from '@/persistence';
import type { PersistStepResult, PipelineContext, PublishStepResult, RefreshPipeline } from '@/scheduler';
import { selectInferenceBuilds, type EngineVersions } from './selection';
import { buildSourcePlan, REQUIRED_PROVIDERS } from './sources';

/** What the refresh step hands to the persist step. */
export interface LiveRefreshOutput {
  readonly result: RefreshResult;
  /** The builds actually selected, needed verbatim by persistence. */
  readonly builds: readonly BuildInputOptions[];
}

export interface LivePipelineConfig {
  /** The persistence store, resolved lazily so composition order does not matter. */
  readonly store: () => PersistenceStore;
  /** Where raw payload envelopes are captured, enabling replay without the network. */
  readonly payloadStore: RawPayloadStore;
  /**
   * The seasons whose per-season datasets are acquired. Career counting stats span exactly
   * these seasons — widening the list widens the career window, and nothing else does.
   */
  readonly seasons: readonly number[];
  /**
   * Extra seasons acquired for GAME STATS ONLY, so QB career fields describe a career.
   *
   * Only QB reads them: every other position stays scoped to `seasons`, because giving the
   * quarterback a real career and re-basing the RB/TE/WR models on a wider window are two
   * different decisions and only the first is being taken here.
   */
  readonly careerSeasons?: readonly number[];
  /**
   * The as-of instant for valuation and the effective date for the payloads, as an ISO
   * string. Supplied by the caller rather than read from a clock in here, so a run is
   * reproducible: the same as-of over the same captures yields the same board.
   */
  readonly asOf: () => string;
  /** Cross-provider identity join with Sleeper. Default false (nflverse alone is coherent). */
  readonly includeSleeper?: boolean;
  readonly engineVersions?: EngineVersions;
  readonly transportConfig?: TransportConfig;
  readonly client?: HttpClient;
  readonly clock?: Clock;
  /**
   * Replay from the capture store instead of fetching. The pipeline is otherwise identical
   * — same plan, same ingestion, same inference, same persistence.
   */
  readonly replayOnly?: boolean;
}

/**
 * Build the production `RefreshPipeline`.
 *
 * The refresh step runs ONE pass: the source plan is acquired, ingested into a snapshot, and
 * the snapshot itself decides which players to value (see ./selection.ts). Passing a
 * selector rather than a pre-computed id list is what keeps it to one pass — canonical ids
 * do not exist until the snapshot that mints them has been built.
 */
export function createLivePipeline(config: LivePipelineConfig): RefreshPipeline<LiveRefreshOutput> {
  const registry = buildDefaultRegistry();
  const transportConfig = config.transportConfig ?? defaultTransportConfig();
  const clock = config.clock ?? systemClock;
  const client = config.client ?? new HttpClient({ clock });

  return {
    async refresh(ctx: PipelineContext): Promise<LiveRefreshOutput> {
      const asOf = config.asOf();
      const sources = buildSourcePlan({
        seasons: config.seasons,
        effectiveDate: asOf,
        mode: config.replayOnly ? 'replay' : 'live',
        ...(config.careerSeasons ? { careerSeasons: config.careerSeasons } : {}),
        ...(config.includeSleeper !== undefined ? { includeSleeper: config.includeSleeper } : {}),
      });

      // Captured while the selector runs, so the persist step can record exactly the builds
      // the refresh used rather than re-deriving them from a snapshot it would have to
      // re-read. Re-deriving would be a second source of truth for the board's contents.
      let builds: readonly BuildInputOptions[] = [];

      const result = await refreshSources(
        {
          sources,
          policy: { requiredProviders: REQUIRED_PROVIDERS },
          inference: (snapshot: NormalizedSnapshot) => {
            builds = selectInferenceBuilds(snapshot, {
              asOf,
              valuationSeasons: config.seasons,
              ...(config.engineVersions ? { engineVersions: config.engineVersions } : {}),
            });
            return builds;
          },
        },
        {
          registry,
          config: transportConfig,
          store: config.payloadStore,
          client,
          clock,
          ...(ctx.signal ? { signal: ctx.signal } : {}),
        },
      );

      return { result, builds };
    },

    async persist(ctx: PipelineContext, refreshOutput: LiveRefreshOutput): Promise<PersistStepResult> {
      const outcome = persistRefreshResult(config.store(), {
        result: refreshOutput.result,
        inferenceBuilds: [...refreshOutput.builds],
        runId: ctx.runId,
        startedAt: ctx.startedAt,
        completedAt: clock.now(),
        requiredProviders: REQUIRED_PROVIDERS,
      });
      return { status: outcome.status, publishable: outcome.publishable, snapshotId: outcome.snapshotId };
    },

    async publish(ctx: PipelineContext): Promise<PublishStepResult> {
      const published = config.store().publishBoard({ runId: ctx.runId });
      return { publicationId: published.publicationId, entryCount: published.entryCount };
    },
  };
}
