// How old the board on screen is, computed from the board itself and the reader's clock.
//
// WHY NOT status.json. The status document is a static file written once at publish time, so
// its `ageHours` is always 0 and its `state` is always "current" — a board left unrefreshed for
// two months still read "Updated less than an hour ago". The only trustworthy inputs are the
// instant the board was published and the instant it is being read.

/** At or under this age a board is presented as current. One weekly refresh cycle plus slack. */
export const BOARD_CURRENT_WITHIN_HOURS = 8 * 24;
/** Beyond this age the board is presented as out of date for in-season decisions. */
export const BOARD_STALE_AFTER_HOURS = 14 * 24;

export type BoardFreshnessState = 'current' | 'aging' | 'stale' | 'unknown';

export interface BoardFreshness {
  readonly state: BoardFreshnessState;
  readonly ageHours: number | null;
  /** e.g. "Published Sep 12, 2026 · 61 days ago". */
  readonly label: string;
  /** A sentence of explanation for anything other than `current`, else null. */
  readonly warning: string | null;
}

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function describeAge(hours: number): string {
  if (hours < 1) return 'less than an hour ago';
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export function boardFreshness(publishedAt: string | null, nowMs: number): BoardFreshness {
  const published = publishedAt === null ? Number.NaN : Date.parse(publishedAt);
  if (!Number.isFinite(published) || !Number.isFinite(nowMs)) {
    return {
      state: 'unknown',
      ageHours: null,
      label: 'Publish time unknown',
      warning: 'This board carries no readable publish time, so its age cannot be shown.',
    };
  }
  const ageHours = Math.max(0, (nowMs - published) / 3_600_000);
  const label = `Published ${DATE.format(new Date(published))} · ${describeAge(ageHours)}`;
  if (ageHours <= BOARD_CURRENT_WITHIN_HOURS) return { state: 'current', ageHours, label, warning: null };
  if (ageHours <= BOARD_STALE_AFTER_HOURS) {
    return {
      state: 'aging',
      ageHours,
      label,
      warning: 'The board has not been refreshed in over a week, so recent games may not be reflected.',
    };
  }
  return {
    state: 'stale',
    ageHours,
    label,
    warning:
      'This board is out of date. It does not reflect recent games, injuries, trades or rookies. ' +
      'Do not treat it as a current valuation.',
  };
}
