// Row and card presentation for a PUBLISHED player (Phase 10).
//
// Distinct from `rows.tsx`, which renders the Demo Market's `PlayerRow` (price, mispricing,
// movement, signal, sparkline). A published player carries none of those, so this renders only
// what the backend actually published and shows an explicit em-dash where it published
// nothing. Absence is displayed as absence — never as 0.0, "flat", or a neutral badge.

import { PositionGlyph } from '@/components/market/primitives';
import { cn } from '@/lib/ui';
import type { PublishedPlayer } from '@/services/publication';
import type { ModelMarketComparison } from '@/market/types';

/** The single place "the backend published nothing here" becomes a character. */
export function Unpublished({ label = 'not published' }: { label?: string }) {
  return (
    <span className="text-text-faint" title={label} aria-label={label}>
      —
    </span>
  );
}

function label(text: string | null) {
  return text === null ? <Unpublished /> : <span>{text}</span>;
}

/** A player's display name, or an honest stand-in built from the canonical id. */
export function PublishedPlayerName({ player }: { player: PublishedPlayer }) {
  if (player.name)
    return <span className="font-medium capitalize text-text-primary">{player.name}</span>;
  return (
    <span className="text-text-secondary">
      <span className="data text-xs">{player.playerId}</span>
      <span className="ml-1.5 text-[11px] text-text-muted">(no name published)</span>
    </span>
  );
}

const BADGE =
  'inline-flex items-center whitespace-nowrap rounded-control border px-2 py-0.5 text-[11px] font-medium';

/** Reads the inference layer's own verdict; it is never softened or re-labelled here. */
export function HonestyBadge({ player }: { player: PublishedPlayer }) {
  const state = player.honestyState ?? player.outputStatus;
  if (!state) return <Unpublished />;
  const unavailable = state === 'UNAVAILABLE' || player.readiness === 'NOT_READY';
  return (
    <span
      className={cn(
        BADGE,
        unavailable
          ? 'border-warning/30 bg-warning/10 text-warning'
          : 'border-border-default bg-surface-subtle text-text-secondary',
      )}
      title={
        unavailable && player.readinessMissingCount !== null
          ? `${player.readinessMissingCount} required model inputs are not available yet`
          : undefined
      }
    >
      {state}
    </span>
  );
}

/**
 * The model tier, in product language.
 *
 * This is the badge that keeps the board honest: a reduced-input valuation is visibly marked
 * as one, everywhere it appears, rather than sitting in the same column as a full-model value
 * with nothing to tell them apart. The label is deliberately plain — "Limited data", not
 * "ACCESSIBLE" — and the tooltip names what was missing in words rather than registry keys.
 */
export function ModelTierBadge({ player }: { player: PublishedPlayer }) {
  const tier = player.modelTier;
  const missing = player.materialMissingInputs;
  if (tier === 'FULL') {
    // The unremarkable case. Decorating it would make the two tiers that actually
    // need attention harder to spot in a long board.
    return (
      <span
        className={cn(BADGE, 'border-border-default bg-surface-subtle text-text-secondary')}
        title="Valued by the full model, using its complete set of inputs."
      >
        Full model
      </span>
    );
  }
  if (tier === 'ACCESSIBLE') {
    return (
      <span
        className={cn(BADGE, 'border-warning/30 bg-warning/10 text-warning')}
        title={
          missing.length > 0
            ? `Valued by the accessible-data model — a reduced model that uses only the data available for this player. Not used: ${missing.join('; ')}.`
            : 'Valued by the accessible-data model — a reduced model that uses only the data available for this player.'
        }
      >
        Limited data
      </span>
    );
  }
  return (
    <span
      className={cn(BADGE, 'border-dashed border-border-strong bg-transparent text-text-muted')}
      title={player.insufficientReason ?? 'Not enough information to value this player.'}
    >
      No value
    </span>
  );
}

/**
 * Column headers carry their own alignment so they sit over their data, not beside
 * it. `grow` marks the one column that absorbs spare width — without it an eight
 * column table spreads evenly and pushes a player's name away from their rank.
 */
/**
 * The external market's DYNASTY rank for a player.
 *
 * RANK, NOT VALUE, ON PURPOSE. The market quotes in trade currency (~10,000 for the top player)
 * and the model in a 0–100 score. Putting those two numbers in adjacent columns invites a
 * comparison that cannot be made — so the column shows the market's RANK, which is the thing
 * both sides genuinely express. The raw market value is on hover, labelled with whose scale it
 * belongs to.
 */
export function MarketRank({ comparison }: { comparison: ModelMarketComparison | undefined }) {
  if (!comparison || comparison.marketRank === null) {
    return <Unpublished label="not covered by this market source" />;
  }
  const value = comparison.marketValue;
  return (
    <span
      className="data text-[13px] text-text-secondary"
      title={
        value === null
          ? 'Ranked by the market, which published no value.'
          : `Dynasty Superflex market value ${value.toLocaleString()} on the source's own scale — not comparable to the model value.`
      }
    >
      {comparison.marketRank}
    </span>
  );
}

/**
 * The disagreement, in ranks — both sides on the DYNASTY horizon.
 *
 * Not against the board's Rank column beside it: that column follows whichever horizon the
 * board is showing (weekly by default), and diffing a weekly rank against a dynasty quote
 * would report a disagreement neither side holds. The model side here is always the player's
 * dynasty composite, whatever the board is sorted by.
 *
 * A negative `overallRankDifference` means PlayerTicker ranks the player higher (a smaller rank
 * number is a better rank), so it is rendered with a leading "+" to read the way a reader
 * expects: "+7" = seven places higher than the market has them. The sign is inverted here, in
 * the one place that renders it, rather than in the data.
 */
/**
 * The long form of the delta, for hover.
 *
 * It names BOTH ranks rather than only their difference, for two reasons. The board's own Rank
 * column follows the displayed horizon (weekly by default) while this delta is measured on
 * dynasty, so a reader who subtracts the two visible numbers can get a different answer — the
 * tooltip shows the arithmetic that was actually done. And the two sides rank different
 * numbers of players, which the percentiles express and a raw place count cannot.
 */
function rankDeltaExplanation(comparison: ModelMarketComparison, placesHigher: number): string {
  const direction = placesHigher > 0 ? 'higher' : 'lower';
  const places = Math.abs(placesHigher);
  const head =
    `On dynasty value: PlayerTicker #${comparison.modelRank}, market #${comparison.marketRank} — ` +
    `${places} place${places === 1 ? '' : 's'} ${direction}.`;
  if (comparison.modelPercentile === null || comparison.marketPercentile === null) return head;
  return (
    `${head} Percentile ${comparison.modelPercentile.toFixed(1)} vs ` +
    `${comparison.marketPercentile.toFixed(1)} — the two sides rank different numbers of players, ` +
    'so percentile is the like-for-like measure.'
  );
}

export function MarketRankDelta({ comparison }: { comparison: ModelMarketComparison | undefined }) {
  if (!comparison || comparison.overallRankDifference === null) return <Unpublished label="no comparison available" />;
  const placesHigher = -comparison.overallRankDifference;
  if (placesHigher === 0) {
    return (
      <span className="text-[13px] text-text-muted" title="On dynasty value, PlayerTicker and the market rank this player the same.">
        =
      </span>
    );
  }
  return (
    <span
      // Deliberately UNCOLOURED. Green/red here would read as a recommendation, and this page
      // does not issue one: a disagreement with the market is an observation, not a signal.
      className="data text-[13px] text-text-secondary"
      title={rankDeltaExplanation(comparison, placesHigher)}
    >
      {placesHigher > 0 ? `+${placesHigher}` : placesHigher}
    </span>
  );
}

export const PUBLISHED_COLUMNS = [
  { label: 'Rank', align: 'right' },
  { label: 'Player', align: 'left', grow: true },
  { label: 'Pos', align: 'left' },
  { label: 'Team', align: 'left' },
  { label: 'Value', align: 'right' },
  { label: 'Mkt Dyn', align: 'right' },
  { label: 'vs Mkt', align: 'right' },
  { label: 'Confidence', align: 'right' },
  { label: 'Volatility', align: 'right' },
  { label: 'Model', align: 'left' },
] as const;

export function PublishedPlayerRow({
  player,
  comparison,
}: {
  player: PublishedPlayer;
  comparison?: ModelMarketComparison;
}) {
  return (
    <tr className="h-[52px] border-t border-border-default text-sm transition-colors duration-standard hover:bg-elevated">
      <td className="data w-px whitespace-nowrap py-2 pl-4 pr-2 text-right text-[13px] text-text-faint">
        {player.overallRank === null ? (
          <Unpublished label="unranked — no published value" />
        ) : (
          player.overallRank
        )}
      </td>
      <td className="w-full px-3 py-2">
        <PublishedPlayerName player={player} />
      </td>
      <td className="w-px px-3 py-2">
        <PositionGlyph position={player.position} />
      </td>
      <td className="w-px whitespace-nowrap px-3 py-2 text-[13px] uppercase tracking-wide text-text-muted">
        {label(player.team)}
      </td>
      <td className="w-px whitespace-nowrap px-3 py-2 text-right">
        <span className="data text-[15px] font-semibold text-text-primary">
          {player.value === null ? <Unpublished /> : player.value.toFixed(1)}
        </span>
      </td>
      <td className="w-px whitespace-nowrap px-3 py-2 text-right">
        <MarketRank comparison={comparison} />
      </td>
      <td className="w-px whitespace-nowrap px-3 py-2 text-right">
        <MarketRankDelta comparison={comparison} />
      </td>
      <td className="w-px whitespace-nowrap px-3 py-2 text-right text-text-secondary">
        {player.confidenceLabel ?? player.publicConfidenceLabel ? (
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-[13px]">
              {label(player.confidenceLabel ?? player.publicConfidenceLabel)}
            </span>
            {player.confidenceScore !== null && (
              <span className="data text-xs text-text-faint">
                {/* A leading space keeps label and score separate in the accessibility tree,
                    where CSS margins do not exist. */}
                {` ${player.confidenceScore.toFixed(0)}`}
              </span>
            )}
          </span>
        ) : (
          <Unpublished />
        )}
      </td>
      <td className="w-px whitespace-nowrap px-3 py-2 text-right text-[13px] text-text-secondary">
        {label(player.volatilityLabel)}
      </td>
      <td className="w-px whitespace-nowrap py-2 pl-3 pr-4">
        <ModelTierBadge player={player} />
      </td>
    </tr>
  );
}

export function PublishedPlayerCard({
  player,
  comparison,
}: {
  player: PublishedPlayer;
  comparison?: ModelMarketComparison;
}) {
  return (
    <div className="border-t border-border-default px-1 py-3.5 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {player.overallRank !== null && (
            <span className="data mt-0.5 w-6 shrink-0 text-right text-[13px] text-text-faint">
              {player.overallRank}
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm">
              <PublishedPlayerName player={player} />
            </div>
            <div className="mt-1 flex items-center gap-2">
              <PositionGlyph position={player.position} />
              {player.team && (
                <span className="text-[11px] uppercase tracking-wide text-text-muted">
                  {player.team}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="data text-data-lg font-semibold text-text-primary">
            {player.value === null ? <Unpublished /> : player.value.toFixed(1)}
          </div>
          <div className="pt-0.5 text-[10px] uppercase tracking-[0.06em] text-text-faint">
            Model value
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-text-muted">
        <ModelTierBadge player={player} />
        <span>Confidence {label(player.confidenceLabel ?? player.publicConfidenceLabel)}</span>
        <span>Volatility {label(player.volatilityLabel)}</span>
        <span className="inline-flex items-baseline gap-1">
          Mkt dynasty <MarketRank comparison={comparison} /> <MarketRankDelta comparison={comparison} />
        </span>
      </div>
      {player.role && <div className="mt-2 text-xs text-text-secondary">{player.role}</div>}
      {player.explanation && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-text-muted">{player.explanation}</p>
      )}
    </div>
  );
}
