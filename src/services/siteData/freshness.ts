// Operational state → words a reader can act on.
//
// The status document is written for an operator: it carries `requiredProviderFailure`,
// `partial`, run ids and heap figures. None of that belongs on screen. This module is the ONLY
// place that translates, so the vocabulary cannot drift between surfaces, and so no component
// is tempted to render a raw field.
//
// THE RULE: never let old data look current. The app keeps serving the last known-good board
// through an outage — that is the point of last-known-good — so an honest label is the only
// thing standing between a stale board and a reader who trusts it.

import type { FreshnessState } from './documents';

export interface FreshnessCopy {
  /** Short label, e.g. "Updated 3h ago". */
  readonly label: string;
  /** One sentence of detail, or null when the label says everything. */
  readonly detail: string | null;
  /**
   * How prominently to treat it. `normal` is unobtrusive; `caution` and `warning` earn
   * attention. Deliberately not a colour — the page decides how to render a tone.
   */
  readonly tone: 'normal' | 'caution' | 'warning';
}

/** "3h ago", "4 days ago", "just now". Whole units only; false precision reads as noise. */
export function describeAge(ageHours: number | null): string | null {
  if (ageHours === null || !Number.isFinite(ageHours)) return null;
  if (ageHours < 0) return 'just now';
  if (ageHours < 1) return 'less than an hour ago';
  if (ageHours < 2) return '1h ago';
  if (ageHours < 24) return `${Math.floor(ageHours)}h ago`;
  const days = Math.floor(ageHours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * Describe one dataset's freshness.
 *
 * `noun` names the thing in the reader's terms ("Board", "Market"). `state` and `ageHours` come
 * straight from the published status document.
 */
export function describeFreshness(
  noun: string,
  state: FreshnessState,
  ageHours: number | null,
): FreshnessCopy {
  const age = describeAge(ageHours);
  switch (state) {
    case 'current':
      return {
        label: age ? `Updated ${age}` : 'Up to date',
        detail: null,
        tone: 'normal',
      };
    case 'stale':
      return {
        // Says WHEN, not merely that something is wrong: a reader can judge whether
        // yesterday's board is good enough for what they are doing.
        label: age ? `${noun} updated ${age}` : `${noun} may be out of date`,
        detail: 'A scheduled refresh has not completed recently, so this may be behind the latest data.',
        tone: 'caution',
      };
    case 'expired':
      return {
        label: age ? `${noun} last updated ${age}` : `${noun} is out of date`,
        detail: 'This data is old enough that it may no longer reflect the current season.',
        tone: 'warning',
      };
    case 'unknown':
      return {
        // NOT "up to date". The absence of a refresh record is not evidence of a recent
        // refresh, and saying otherwise is how a broken pipeline comes to look healthy.
        label: `${noun} update time unknown`,
        detail: 'No refresh has been recorded for this data yet.',
        tone: 'warning',
      };
  }
}
