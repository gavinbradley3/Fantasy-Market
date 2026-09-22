// A one-line freshness note. Deliberately small.
//
// The published status document is written for an operator, but board age is recalculated from
// the publication actually loaded and the browser clock. Frozen exported age/state fields are
// never treated as live facts.
//
// Attempt health is shown only when status identity matches the loaded board. Status absence or
// mismatch cannot hide the age supported by the publication itself and cannot invent failure.

import { useEffect, useState } from 'react';
import { STALENESS, ageHours, classifyFreshness } from '@/contracts/freshness';
import { usePublishedMarket } from '@/services/publication';
import { describeFreshness, useSiteStatus } from '@/services/siteData';

const TONE_CLASS: Record<'normal' | 'caution' | 'warning', string> = {
  // Existing tokens only — no new colour is introduced for this.
  normal: 'text-text-muted',
  caution: 'text-text-secondary',
  warning: 'text-text-primary',
};

export interface FreshnessNoteProps {
  /** Which dataset to describe. */
  readonly dataset: 'board' | 'market';
  readonly className?: string;
}

const CLOCK_INTERVAL_MS = 60_000;

/** A modest display clock: no data refetch and no model work, just elapsed-time updates. */
export function useFreshnessClock(): string {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const update = () => setNow(new Date().toISOString());
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        update();
        schedule();
      }, CLOCK_INTERVAL_MS);
    };
    schedule();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') update();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return now;
}

function isFailedAttemptForDisplayedBoard(
  status: ReturnType<typeof useSiteStatus>['status'],
  market: NonNullable<ReturnType<typeof usePublishedMarket>['market']>,
  now: string,
): boolean {
  if (!status || status.board.publicationId !== market.publicationId
    || status.board.checksum !== market.boardChecksum
    || status.board.publishedAt !== market.publishedAt) return false;
  const attempt = status.board.lastAttempt;
  if (!attempt || attempt.outcome !== 'failure') return false;
  const attemptedAt = Date.parse(attempt.attemptedAt);
  const publishedAt = Date.parse(market.publishedAt);
  const observedAt = Date.parse(now);
  return Number.isFinite(attemptedAt) && Number.isFinite(publishedAt) && Number.isFinite(observedAt)
    && attemptedAt > publishedAt && attemptedAt <= observedAt;
}

export function FreshnessNote({ dataset, className }: FreshnessNoteProps) {
  const { status } = useSiteStatus();
  const publication = usePublishedMarket();
  const now = useFreshnessClock();
  const noun = dataset === 'board' ? 'Board' : 'Market';
  const timestamp = dataset === 'board' ? publication.market?.publishedAt ?? null : status?.market.capturedAt ?? null;
  if (dataset === 'board' && !publication.market) return null;
  if (dataset === 'market' && status === null) return null;

  const currentHours = dataset === 'board' ? STALENESS.boardCurrentHours : STALENESS.marketCurrentHours;
  const expiredHours = dataset === 'board' ? STALENESS.boardExpiredHours : STALENESS.marketExpiredHours;
  const state = classifyFreshness(timestamp, now, currentHours, expiredHours);
  const age = ageHours(timestamp, now);
  const copy = describeFreshness(noun, state, age);
  const refreshFailed = dataset === 'board' && publication.market
    ? isFailedAttemptForDisplayedBoard(status, publication.market, now)
    : false;

  return (
    <p
      className={`text-xs leading-relaxed ${TONE_CLASS[copy.tone]}${className ? ` ${className}` : ''}`}
      // Announced politely so a reader on a screen reader learns the board went stale without
      // being interrupted mid-task.
      aria-live="polite"
    >
      <span>{copy.label}</span>
      {copy.detail !== null && <span className="ml-1 text-text-faint">{copy.detail}</span>}
      {refreshFailed && (
        <span className="ml-1 text-text-faint">
          The latest refresh failed; this is the last published board.
        </span>
      )}
    </p>
  );
}
