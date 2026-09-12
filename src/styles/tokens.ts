import tokens from './tokens.json';

/**
 * Brand tokens for the places a Tailwind class cannot reach: chart libraries that
 * take colours as props, and SVG attributes.
 *
 * This is the same tokens.json that theme.css and tailwind.config.js mirror, so a
 * chart and a table cell asking for "positive" get the identical colour, and
 * tokens.test.ts fails the build if the three ever drift.
 */
export const TOKENS = tokens;

export const CHART = {
  /** The focal series is PlayerTicker's own number, so it carries the brand accent. */
  primary: tokens.color.brand.blue,
  /** Reference series sit back and read as context. */
  reference: tokens.color.text.muted,
  grid: tokens.color.border.default,
  axis: tokens.color.text.faint,
  surface: tokens.color.bg.surfaceElevated,
  border: tokens.color.border.default,
  canvas: tokens.color.bg.canvas,
  positive: tokens.color.status.positive,
  negative: tokens.color.status.negative,
  warning: tokens.color.status.warning,
} as const;
