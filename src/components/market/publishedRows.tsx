// Row and card presentation for a PUBLISHED player (Phase 10).
//
// Distinct from `rows.tsx`, which renders the Demo Market's `PlayerRow` (price, mispricing,
// movement, signal, sparkline). A published player carries none of those, so this renders only
// what the backend actually published and shows an explicit em-dash where it published
// nothing. Absence is displayed as absence — never as 0.0, "flat", or a neutral badge.

import { cn } from '@/lib/ui';
import type { PublishedPlayer } from '@/services/publication';

/** The single place "the backend published nothing here" becomes a character. */
export function Unpublished({ label = 'not published' }: { label?: string }) {
  return (
    <span className="text-text-muted" title={label} aria-label={label}>
      —
    </span>
  );
}

function value(n: number | null, decimals = 1) {
  return n === null ? <Unpublished /> : <span className="font-mono tabnum">{n.toFixed(decimals)}</span>;
}

function label(text: string | null) {
  return text === null ? <Unpublished /> : <span>{text}</span>;
}

/** A player's display name, or an honest stand-in built from the canonical id. */
export function PublishedPlayerName({ player }: { player: PublishedPlayer }) {
  if (player.name) return <span className="capitalize text-text-primary">{player.name}</span>;
  return (
    <span className="text-text-secondary">
      <span className="font-mono text-xs">{player.playerId}</span>
      <span className="ml-1.5 text-[11px] text-text-muted">(no name published)</span>
    </span>
  );
}

/** Reads the inference layer's own verdict; it is never softened or re-labelled here. */
export function HonestyBadge({ player }: { player: PublishedPlayer }) {
  const state = player.honestyState ?? player.outputStatus;
  if (!state) return <Unpublished />;
  const unavailable = state === 'UNAVAILABLE' || player.readiness === 'NOT_READY';
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5 text-[11px]',
        unavailable
          ? 'border-border-subtle bg-elevated text-text-muted'
          : 'border-up/40 bg-up/10 text-text-primary',
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
    return (
      <span
        className="rounded-full border border-up/40 bg-up/10 px-2 py-0.5 text-[11px] text-text-primary"
        title="Valued by the full model, using its complete set of inputs."
      >
        Full model
      </span>
    );
  }
  if (tier === 'ACCESSIBLE') {
    return (
      <span
        className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] text-text-primary"
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
      className="rounded-full border border-border-subtle bg-elevated px-2 py-0.5 text-[11px] text-text-muted"
      title={player.insufficientReason ?? 'Not enough information to value this player.'}
    >
      No value
    </span>
  );
}

export const PUBLISHED_COLUMNS = [
  'Rank',
  'Player',
  'Pos',
  'Team',
  'Value',
  'Confidence',
  'Volatility',
  'Model',
] as const;

export function PublishedPlayerRow({ player }: { player: PublishedPlayer }) {
  return (
    <tr className="border-t border-border-subtle text-sm">
      <td className="py-2 pl-3 font-mono tabnum text-text-secondary">
        {player.overallRank === null ? <Unpublished label="unranked — no published value" /> : player.overallRank}
      </td>
      <td className="px-2">
        <PublishedPlayerName player={player} />
      </td>
      <td className="px-2 text-text-secondary">{player.position}</td>
      <td className="px-2 text-text-secondary">{label(player.team)}</td>
      <td className="px-2 text-right text-text-primary">{value(player.value)}</td>
      <td className="px-2 text-text-secondary">
        {player.confidenceLabel ?? player.publicConfidenceLabel ? (
          <>
            {label(player.confidenceLabel ?? player.publicConfidenceLabel)}
            {player.confidenceScore !== null && (
              <span className="ml-1.5 font-mono tabnum text-xs text-text-muted">
                {/* A leading space keeps label and score separate in the accessibility tree,
                    where CSS margins do not exist. */}
                {` ${player.confidenceScore.toFixed(0)}`}
              </span>
            )}
          </>
        ) : (
          <Unpublished />
        )}
      </td>
      <td className="px-2 text-text-secondary">{label(player.volatilityLabel)}</td>
      <td className="px-2 pr-3">
        <ModelTierBadge player={player} />
      </td>
    </tr>
  );
}

export function PublishedPlayerCard({ player }: { player: PublishedPlayer }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            <PublishedPlayerName player={player} />
          </div>
          <div className="mt-0.5 text-xs text-text-secondary">
            {player.position}
            {player.team && ` · ${player.team}`}
            {player.overallRank !== null && ` · #${player.overallRank}`}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-base text-text-primary">{value(player.value)}</div>
          <div className="text-[11px] text-text-muted">model value</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        <ModelTierBadge player={player} />
        <span>
          Confidence: {label(player.confidenceLabel ?? player.publicConfidenceLabel)}
        </span>
        <span>Volatility: {label(player.volatilityLabel)}</span>
      </div>
      {player.role && <div className="mt-1.5 text-xs text-text-secondary">{player.role}</div>}
      {player.explanation && (
        <p className="mt-1.5 text-[11px] leading-snug text-text-muted">{player.explanation}</p>
      )}
    </div>
  );
}
