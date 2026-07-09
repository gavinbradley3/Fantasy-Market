// Deterministic template thesis generator (§11.10, §16.9). It fills the fixed
// 5-part thesis structure from structured fields only — no LLM, no invented data.
// It implements the same ThesisGenerator interface a future AI generator will
// implement, so swapping generators later touches zero UI (§16.9).

import { CLASS_BY_ID } from '@/config/taxonomy';
import { SIGNAL_META } from '@/config/market';
import { TEMPLATE_VERSION } from '@/config/market';
import { confidenceLabel, directionOf, mispricingBandLabel } from '@/lib/format';
import type { ComputedPlayer } from '@/services/marketData/mock/buildDataset';
import type { MarketThesis } from '@/types/market';

export interface ThesisGenerator {
  generate(cp: ComputedPlayer): MarketThesis;
}

function trajectoryWord(d30: number): string {
  const dir = directionOf(d30, 0.5);
  if (dir === 'up') return 'climbing';
  if (dir === 'down') return 'sliding';
  return 'holding steady';
}

export const templateGenerator: ThesisGenerator = {
  generate(cp: ComputedPlayer): MarketThesis {
    const { player, snapshot: s, signal, catalysts } = cp;
    const cls = CLASS_BY_ID[s.assetClass].label;
    const conf = confidenceLabel(signal.confidence);

    const valueSummary = `${player.displayName} is priced at ${s.marketPrice.toFixed(1)} — a ${cls.toLowerCase()} ${trajectoryWord(s.movement.d30)} over the past month, against a model value of ${s.fundamentalValue.toFixed(1)}.`;

    const bull = catalysts.find((c) => c.direction === 'bullish');
    const bear = catalysts.find((c) => c.direction === 'bearish');
    const whyMoving = bull || bear
      ? `${(bull ?? bear)!.headline} — ${(bull ?? bear)!.detail} The market has moved ${s.movement.d30 >= 0 ? 'up' : 'down'} ${Math.abs(s.movement.d30).toFixed(1)} over 30 days.`
      : `No single catalyst dominates; the ${Math.abs(s.movement.d30).toFixed(1)}-point 30-day move reflects gradual repricing toward the model.`;

    const gap = s.fundamentalValue - s.marketPrice;
    const bullCase = gap > 0
      ? `The underlying profile supports a higher value: model value ${s.fundamentalValue.toFixed(1)} implies room above the current ${s.marketPrice.toFixed(1)} if the usage holds.`
      : `A strong, stable role keeps ${player.displayName} a dependable ${cls.toLowerCase()}; the floor is the appeal more than the upside.`;

    const topRisk = cp.riskFactors[0];
    const bearCase = topRisk
      ? `${topRisk.headline}: ${topRisk.detail}${gap < 0 ? ' The price already leans on the optimistic case.' : ''}`
      : `The main risk is that the market has this one about right, leaving little edge either way.`;

    const verdict = `${SIGNAL_META[signal.signal].label}, ${conf} confidence — ${mispricingBandLabel(s.mispricing).toLowerCase()} at ${s.mispricing > 0 ? '+' : ''}${s.mispricing}.`;

    return {
      playerId: player.identity.internal_id,
      format: s.format,
      generator: 'template',
      templateVersion: TEMPLATE_VERSION,
      valueSummary,
      whyMoving,
      bullCase,
      bearCase,
      verdict,
      confidence: signal.confidence,
      insufficientData: player.isRookie,
    };
  },
};
