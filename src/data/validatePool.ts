// Pool identity validation (DESIGN §27: "identity mapping is load-bearing").
// Fails LOUDLY — a duplicate or missing canonical id silently corrupts every
// persisted watchlist/portfolio entry, so we refuse to build a market on top
// of a broken identity table. Runs once on first dataset build (dev, test,
// and prod alike; the root error boundary catches it in prod).

import type { PlayerSeed } from '@/data/pool';

export class PoolValidationError extends Error {
  constructor(problems: string[]) {
    super(`Player pool failed identity validation:\n- ${problems.join('\n- ')}`);
    this.name = 'PoolValidationError';
  }
}

const ID_PATTERN = /^pt_\d{4}$/;

export function validatePool(pool: readonly PlayerSeed[]): void {
  const problems: string[] = [];
  const ids = new Map<string, string>(); // id -> ticker (for error messages)
  const tickers = new Map<string, string>();
  const sleeperIds = new Map<string, string>();
  const gsisIds = new Map<string, string>();

  for (const seed of pool) {
    const label = `${seed.ticker || '???'} (${seed.name || 'unnamed'})`;

    if (!seed.id) {
      problems.push(`missing id on ${label}`);
    } else if (!ID_PATTERN.test(seed.id)) {
      problems.push(`malformed id "${seed.id}" on ${label} (expected pt_NNNN)`);
    } else if (ids.has(seed.id)) {
      problems.push(`duplicate id "${seed.id}" on ${label} and ${ids.get(seed.id)}`);
    } else {
      ids.set(seed.id, label);
    }

    if (!seed.ticker || seed.ticker.length < 2 || seed.ticker.length > 4) {
      problems.push(`bad ticker "${seed.ticker}" on ${label}`);
    } else if (tickers.has(seed.ticker)) {
      problems.push(`duplicate ticker "${seed.ticker}" on ${label} and ${tickers.get(seed.ticker)}`);
    } else {
      tickers.set(seed.ticker, label);
    }

    if (seed.sleeperId) {
      if (sleeperIds.has(seed.sleeperId)) {
        problems.push(`duplicate sleeperId "${seed.sleeperId}" on ${label} and ${sleeperIds.get(seed.sleeperId)}`);
      } else {
        sleeperIds.set(seed.sleeperId, label);
      }
    }
    if (seed.gsisId) {
      if (gsisIds.has(seed.gsisId)) {
        problems.push(`duplicate gsisId "${seed.gsisId}" on ${label} and ${gsisIds.get(seed.gsisId)}`);
      } else {
        gsisIds.set(seed.gsisId, label);
      }
    }
  }

  if (problems.length > 0) throw new PoolValidationError(problems);
}
