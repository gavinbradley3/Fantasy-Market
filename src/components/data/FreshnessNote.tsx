// A one-line freshness note. Deliberately small.
//
// The published status document is written for an operator — it carries
// `requiredProviderFailure`, `partial`, run ids and heap figures. None of that belongs on
// screen, and none of it appears here: `describeFreshness` does the translating and this
// component only renders the words it returns.
//
// It renders NOTHING when there is no status document to read. Saying "up to date" without
// having verified it is the one failure this whole surface exists to prevent.

import { describeFreshness, useSiteStatus, type FreshnessState } from '@/services/siteData';

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

export function FreshnessNote({ dataset, className }: FreshnessNoteProps) {
  const { status, failed } = useSiteStatus();

  // No document, or one we could not read: say nothing. An unlabelled board is honest; a board
  // labelled "updated just now" on no evidence is not.
  if (status === null || failed) return null;

  const slice = dataset === 'board' ? status.board : status.market;
  const noun = dataset === 'board' ? 'Board' : 'Market';
  const copy = describeFreshness(noun, slice.state as FreshnessState, slice.ageHours);

  return (
    <p
      className={`text-xs leading-relaxed ${TONE_CLASS[copy.tone]}${className ? ` ${className}` : ''}`}
      // Announced politely so a reader on a screen reader learns the board went stale without
      // being interrupted mid-task.
      aria-live="polite"
    >
      <span>{copy.label}</span>
      {copy.detail !== null && <span className="ml-1 text-text-faint">{copy.detail}</span>}
    </p>
  );
}
