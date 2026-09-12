// Operations: staleness classification and the status document.
//
// These are the rules that stop a failed refresh from looking like a healthy one. The app keeps
// serving the last known-good board through an outage — that is the point — so the only thing
// between a stale board and a user who trusts it is an honest label, computed here.

import { describe, expect, it } from 'vitest';
import { CADENCE_HOURS, STALENESS, ageHours, classifyFreshness } from './staleness';
import { buildStatus, type StatusInputs } from './status';
import type { HealthReport } from '@/application';
import type { RefreshRunView } from '@/persistence';

const NOW = '2026-09-12T12:00:00.000Z';
const hoursAgo = (h: number) => new Date(Date.parse(NOW) - h * 3_600_000).toISOString();

const health = (checksum: string | null = 'board-abc'): HealthReport =>
  ({
    status: 'ok',
    scheduler: { enabled: false, running: false, state: 'stopped' },
    persistence: { available: true },
    publication: { hasCurrent: checksum !== null, currentPublicationId: 'pub-1', boardChecksum: checksum },
    replay: { available: true },
    transport: { requiredProviders: ['nflverse'], replayEnabled: true },
    checkedAt: NOW,
  }) as HealthReport;

function run(over: {
  at?: string;
  status?: string;
  requiredFailure?: boolean;
  sources?: { provider: string; status: string }[];
  players?: number;
}): RefreshRunView {
  const at = over.at ?? hoursAgo(1);
  return {
    run: {
      runId: `run-${at}`,
      schemaVersion: 'run/1',
      startedAt: new Date(Date.parse(at) - 120_000).toISOString(),
      completedAt: at,
      mode: 'live',
      status: (over.status ?? 'success') as never,
      requiredFailure: over.requiredFailure ?? false,
      sourceCount: (over.sources ?? []).length,
      successCount: (over.sources ?? []).filter((s) => s.status === 'success').length,
      failureCount: (over.sources ?? []).filter((s) => s.status !== 'success').length,
      codeVersion: null,
      configFingerprint: null,
      snapshotId: 'snap-1',
      createdAt: at,
    },
    sources: (over.sources ?? [{ provider: 'nflverse', status: 'success' }]) as never,
    inference: new Array(over.players ?? 867).fill({}) as never,
  } as RefreshRunView;
}

function inputs(over: Partial<StatusInputs> = {}): StatusInputs {
  return {
    now: NOW,
    health: health(),
    runs: [run({})],
    boardEntryCount: 867,
    boardPublishedAt: hoursAgo(1),
    marketQuoteCount: 439,
    marketCapturedAt: hoursAgo(24),
    marketSourceTimestamp: hoursAgo(30),
    marketHistoryAppended: true,
    ...over,
  };
}

describe('staleness thresholds are derived from the cadence', () => {
  it('ties every threshold to the schedule that produces the data', () => {
    // If a cron changes, the thresholds move with it rather than silently becoming wrong.
    expect(STALENESS.boardCurrentHours).toBe(CADENCE_HOURS.nflverse * 2);
    expect(STALENESS.marketCurrentHours).toBe(CADENCE_HOURS.market * 2);
  });

  it('tolerates exactly one missed run before calling a board stale', () => {
    expect(classifyFreshness(hoursAgo(CADENCE_HOURS.nflverse), NOW, STALENESS.boardCurrentHours, STALENESS.boardExpiredHours)).toBe('current');
    expect(classifyFreshness(hoursAgo(CADENCE_HOURS.nflverse * 2), NOW, STALENESS.boardCurrentHours, STALENESS.boardExpiredHours)).toBe('current');
    expect(classifyFreshness(hoursAgo(CADENCE_HOURS.nflverse * 3), NOW, STALENESS.boardCurrentHours, STALENESS.boardExpiredHours)).toBe('stale');
  });

  it('escalates to expired rather than staying stale forever', () => {
    expect(classifyFreshness(hoursAgo(24 * 8), NOW, STALENESS.boardCurrentHours, STALENESS.boardExpiredHours)).toBe('expired');
  });

  it('treats a MISSING timestamp as unknown, never as current', () => {
    // The absence of a refresh record is not evidence of a recent refresh. Defaulting the other
    // way is exactly how a broken pipeline comes to look healthy.
    expect(classifyFreshness(null, NOW, 12, 168)).toBe('unknown');
    expect(ageHours(null, NOW)).toBeNull();
  });

  it('treats an unparseable timestamp as unknown rather than throwing', () => {
    expect(classifyFreshness('not a date', NOW, 12, 168)).toBe('unknown');
  });
});

describe('the status document answers the operational questions', () => {
  it('reports a healthy refresh as ok', () => {
    const s = buildStatus(inputs());
    expect(s.overall).toBe('ok');
    expect(s.board.state).toBe('current');
    expect(s.board.entryCount).toBe(867);
    expect(s.lastRun.playerCount).toBe(867);
    expect(s.lastRun.servingLastKnownGood).toBe(false);
  });

  it('publishes the threshold it judged against, so a label can be audited', () => {
    const s = buildStatus(inputs());
    expect(s.board.currentWithinHours).toBe(STALENESS.boardCurrentHours);
    expect(s.market.currentWithinHours).toBe(STALENESS.marketCurrentHours);
  });

  it('a Sleeper failure alone is NOT degraded — that is the production policy', () => {
    const s = buildStatus(
      inputs({
        runs: [run({ status: 'partial', sources: [{ provider: 'nflverse', status: 'success' }, { provider: 'sleeper', status: 'failure' }] })],
      }),
    );
    expect(s.overall).toBe('ok');
    expect(s.providers.sleeper.required).toBe(false);
    expect(s.providers.sleeper.lastAttemptSucceeded).toBe(false);
    expect(s.providers.nflverse.lastAttemptSucceeded).toBe(true);
    expect(s.lastRun.status).toBe('partial');
  });

  it('a required-provider failure IS degraded, and says the board is last-known-good', () => {
    const s = buildStatus(
      inputs({
        boardPublishedAt: hoursAgo(30),
        runs: [run({ requiredFailure: true, status: 'partial', players: 0, sources: [{ provider: 'nflverse', status: 'failure' }] })],
      }),
    );
    expect(s.overall).toBe('degraded');
    expect(s.lastRun.requiredProviderFailure).toBe(true);
    expect(s.lastRun.servingLastKnownGood).toBe(true);
    expect(s.board.state).toBe('stale');
  });

  it('distinguishes Sleeper never attempted from Sleeper attempted and failed', () => {
    const never = buildStatus(inputs({ runs: [run({ sources: [{ provider: 'nflverse', status: 'success' }] })] }));
    expect(never.providers.sleeper.lastAttemptAt).toBeNull();
    expect(never.providers.sleeper.lastAttemptSucceeded).toBeNull();

    const failed = buildStatus(
      inputs({ runs: [run({ sources: [{ provider: 'nflverse', status: 'success' }, { provider: 'sleeper', status: 'failure' }] })] }),
    );
    expect(failed.providers.sleeper.lastAttemptAt).not.toBeNull();
    expect(failed.providers.sleeper.lastAttemptSucceeded).toBe(false);
  });

  it('remembers the last Sleeper SUCCESS even when the newest attempt failed', () => {
    const s = buildStatus(
      inputs({
        runs: [
          run({ at: hoursAgo(1), sources: [{ provider: 'nflverse', status: 'success' }, { provider: 'sleeper', status: 'failure' }] }),
          run({ at: hoursAgo(7), sources: [{ provider: 'nflverse', status: 'success' }, { provider: 'sleeper', status: 'success' }] }),
        ],
      }),
    );
    expect(s.providers.sleeper.lastAttemptSucceeded).toBe(false);
    expect(s.providers.sleeper.lastSuccessAt).toBe(hoursAgo(7));
  });

  it('a stale board is degraded even though the app is still serving it', () => {
    // The failure mode this exists to prevent: old data looking current because the app has not
    // stopped responding.
    const s = buildStatus(inputs({ boardPublishedAt: hoursAgo(24 * 3) }));
    expect(s.board.state).toBe('stale');
    expect(s.overall).toBe('degraded');
  });

  it('reports a market snapshot older than a month as expired, with its source timestamp intact', () => {
    const s = buildStatus(inputs({ marketCapturedAt: hoursAgo(24 * 40), marketSourceTimestamp: hoursAgo(24 * 41) }));
    expect(s.market.state).toBe('expired');
    expect(s.market.sourceTimestamp).toBe(hoursAgo(24 * 41));
    expect(s.market.quoteCount).toBe(439);
  });

  it('reports no runs at all as unknown rather than inventing a healthy state', () => {
    const s = buildStatus(inputs({ runs: [], boardPublishedAt: null, marketCapturedAt: null, boardEntryCount: null }));
    expect(s.board.state).toBe('unknown');
    expect(s.market.state).toBe('unknown');
    expect(s.overall).toBe('degraded');
    expect(s.providers.nflverse.lastSuccessAt).toBeNull();
    expect(s.lastRun.runId).toBeNull();
  });
});
