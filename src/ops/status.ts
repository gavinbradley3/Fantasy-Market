// The freshness/status document.
//
// PlayerTicker has no monitoring service and does not need one: the refresh-run table already
// records every provider outcome, and the publication table records every board. This module
// reads both back and answers the operational questions in one small document:
//
//   when did nflverse last succeed · was Sleeper attempted, and did it work · when did the
//   market last refresh · is any of it stale · did the last attempt fail · what was preserved
//
// It is a pure function of persisted state and an injected `now`, so it is fully testable and
// the same inputs always produce the same document.

import type { HealthReport } from '@/application';
import type { RefreshRunView } from '@/persistence';
import { STALENESS, ageHours, classifyFreshness, type FreshnessState } from './staleness';

/** One provider's operational history, as the run table records it. */
export interface ProviderStatus {
  /** Last run in which this provider was requested at all. */
  readonly lastAttemptAt: string | null;
  /** Last run in which every requested source for this provider succeeded. */
  readonly lastSuccessAt: string | null;
  /** Whether the most recent attempt succeeded. `null` when never attempted. */
  readonly lastAttemptSucceeded: boolean | null;
  /** Whether this provider is required for a board to publish. */
  readonly required: boolean;
}

export interface StatusDocument {
  readonly generatedAt: string;
  readonly board: {
    readonly state: FreshnessState;
    readonly publishedAt: string | null;
    readonly ageHours: number | null;
    readonly entryCount: number | null;
    readonly checksum: string | null;
    /** Thresholds this state was judged against, so the label can be audited. */
    readonly currentWithinHours: number;
  };
  readonly market: {
    readonly state: FreshnessState;
    readonly capturedAt: string | null;
    readonly sourceTimestamp: string | null;
    readonly ageHours: number | null;
    readonly quoteCount: number;
    readonly historyAppended: boolean;
    readonly currentWithinHours: number;
  };
  readonly providers: {
    readonly nflverse: ProviderStatus;
    readonly sleeper: ProviderStatus;
  };
  readonly lastRun: {
    readonly runId: string | null;
    readonly startedAt: string | null;
    readonly completedAt: string | null;
    readonly durationSeconds: number | null;
    readonly mode: string | null;
    readonly status: string | null;
    readonly requiredProviderFailure: boolean | null;
    readonly sourceCount: number | null;
    readonly successCount: number | null;
    readonly failureCount: number | null;
    readonly playerCount: number | null;
    /** True when this run did NOT publish, so the served board is from an earlier one. */
    readonly servingLastKnownGood: boolean;
  };
  /** `ok` when a board is current and no required provider failed on the last run. */
  readonly overall: 'ok' | 'degraded';
}

export interface StatusInputs {
  readonly now: string;
  readonly health: HealthReport;
  readonly runs: readonly RefreshRunView[];
  readonly boardEntryCount: number | null;
  readonly boardPublishedAt: string | null;
  readonly marketQuoteCount: number;
  readonly marketCapturedAt: string | null;
  readonly marketSourceTimestamp: string | null;
  readonly marketHistoryAppended: boolean;
}

/** Runs are newest-first; find the first for which `predicate` holds. */
function firstRun(
  runs: readonly RefreshRunView[],
  predicate: (run: RefreshRunView) => boolean,
): RefreshRunView | null {
  for (const r of runs) if (predicate(r)) return r;
  return null;
}

function providerStatus(runs: readonly RefreshRunView[], provider: string, required: boolean): ProviderStatus {
  const requested = (r: RefreshRunView) => r.sources.some((s) => s.provider === provider);
  const allSucceeded = (r: RefreshRunView) =>
    requested(r) && r.sources.filter((s) => s.provider === provider).every((s) => s.status === 'success');
  const attempt = firstRun(runs, requested);
  const success = firstRun(runs, allSucceeded);
  return {
    lastAttemptAt: attempt?.run.completedAt ?? null,
    lastSuccessAt: success?.run.completedAt ?? null,
    lastAttemptSucceeded: attempt === null ? null : allSucceeded(attempt),
    required,
  };
}

export function buildStatus(input: StatusInputs): StatusDocument {
  const last = input.runs[0] ?? null;
  const boardState = classifyFreshness(
    input.boardPublishedAt,
    input.now,
    STALENESS.boardCurrentHours,
    STALENESS.boardExpiredHours,
  );
  const marketState = classifyFreshness(
    input.marketCapturedAt,
    input.now,
    STALENESS.marketCurrentHours,
    STALENESS.marketExpiredHours,
  );

  const duration =
    last && Number.isFinite(Date.parse(last.run.startedAt)) && Number.isFinite(Date.parse(last.run.completedAt))
      ? Math.round((Date.parse(last.run.completedAt) - Date.parse(last.run.startedAt)) / 1000)
      : null;

  // The served board comes from an earlier run whenever the newest run produced no publication.
  // That is the last-known-good path working, and it must be visible rather than inferred.
  const servingLastKnownGood = last !== null && (last.run.requiredFailure || last.inference.length === 0);

  return {
    generatedAt: input.now,
    board: {
      state: boardState,
      publishedAt: input.boardPublishedAt,
      ageHours: ageHours(input.boardPublishedAt, input.now),
      entryCount: input.boardEntryCount,
      checksum: input.health.publication.boardChecksum,
      currentWithinHours: STALENESS.boardCurrentHours,
    },
    market: {
      state: marketState,
      capturedAt: input.marketCapturedAt,
      sourceTimestamp: input.marketSourceTimestamp,
      ageHours: ageHours(input.marketCapturedAt, input.now),
      quoteCount: input.marketQuoteCount,
      historyAppended: input.marketHistoryAppended,
      currentWithinHours: STALENESS.marketCurrentHours,
    },
    providers: {
      nflverse: providerStatus(input.runs, 'nflverse', true),
      // Sleeper is enrichment. `required: false` is the machine-readable form of "try Sleeper,
      // never depend on Sleeper", and a consumer can tell a failed enrichment from a failed
      // board without knowing the policy.
      sleeper: providerStatus(input.runs, 'sleeper', false),
    },
    lastRun: {
      runId: last?.run.runId ?? null,
      startedAt: last?.run.startedAt ?? null,
      completedAt: last?.run.completedAt ?? null,
      durationSeconds: duration,
      mode: last?.run.mode ?? null,
      status: last?.run.status ?? null,
      requiredProviderFailure: last?.run.requiredFailure ?? null,
      sourceCount: last?.run.sourceCount ?? null,
      successCount: last?.run.successCount ?? null,
      failureCount: last?.run.failureCount ?? null,
      playerCount: last ? last.inference.length : null,
      servingLastKnownGood,
    },
    // Degraded when the board is not current, or when the last run lost a required provider.
    // A Sleeper failure alone is NOT degraded — that is the policy, stated in one place.
    overall: boardState === 'current' && last?.run.requiredFailure !== true ? 'ok' : 'degraded',
  };
}
