// Public release policy. Deliberately constants, not environment variables: changing what the
// public site shows is a reviewed code change, never a deploy-time toggle.

/**
 * External dynasty market comparison (DynastyProcess / FantasyPros-derived values).
 *
 * Disabled until redistribution rights are established in writing. The integration code
 * (`src/market`, `src/services/market`, the `/market` API route) is preserved so a properly
 * licensed source can be enabled later by flipping this flag in a reviewed change.
 */
export const EXTERNAL_MARKET_ENABLED = false;

/**
 * Confidence and volatility labels.
 *
 * Suppressed: neither has been calibrated against realised outcomes (see
 * docs/PHASE1_RECOVERY_AUDIT.md, B11). They return only after the validation framework shows
 * that a stated level corresponds to a measured error rate.
 */
export const CONFIDENCE_LABELS_ENABLED = false;

/**
 * The only files the public site serves from the data branch. Everything else on that branch
 * (the market capture, its history) stays private.
 */
export const PUBLIC_DATA_FILES = ['board.json', 'status.json'] as const;

/**
 * Board entry fields withheld from the public copy of board.json, because the UI no longer
 * presents them and publishing them as raw numbers would re-expose uncalibrated claims.
 * The canonical artifact on the data branch is unchanged; only the deployed copy is redacted.
 */
export const REDACTED_BOARD_FIELDS = [
  'confidenceScore',
  'confidenceLabel',
  'publicConfidenceLabel',
  'volatilityScore',
  'volatilityLabel',
  'honestyState',
] as const;
