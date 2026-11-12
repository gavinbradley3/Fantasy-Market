// Ranking metrics. All are computed within a position unless stated.

/** Average ranks (1 = smallest), ties share the mean rank. */
export function ranks(values: readonly number[]): number[] {
  const idx = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(values.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

export function pearson(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  if (n < 3) return NaN;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += x[i];
    my += y[i];
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx === 0 || syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy);
}

export const spearman = (x: readonly number[], y: readonly number[]) => pearson(ranks(x), ranks(y));

/**
 * Share of player pairs ordered correctly, among pairs whose realised outcomes differ by at least
 * `minGap` points. A predicted tie counts as half.
 */
export function pairwiseAccuracy(pred: readonly number[], actual: readonly number[], minGap: number): { acc: number; pairs: number } {
  let good = 0;
  let pairs = 0;
  for (let i = 0; i < pred.length; i++) {
    for (let j = i + 1; j < pred.length; j++) {
      const da = actual[i] - actual[j];
      if (Math.abs(da) < minGap) continue;
      pairs++;
      const dp = pred[i] - pred[j];
      if (dp === 0) good += 0.5;
      else if (Math.sign(dp) === Math.sign(da)) good += 1;
    }
  }
  return { acc: pairs ? good / pairs : NaN, pairs };
}

/** Share of the realised top N that the prediction also places in its top N. Ties broken by index. */
export function precisionAtN(pred: readonly number[], actual: readonly number[], n: number): number {
  const top = (v: readonly number[]) =>
    new Set(v.map((x, i) => [x, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, n).map((p) => p[1]));
  const k = Math.min(n, pred.length);
  if (k === 0) return NaN;
  const p = top(pred);
  let hit = 0;
  for (const i of top(actual)) if (p.has(i)) hit++;
  return hit / k;
}

/** Deterministic PRNG (mulberry32) so bootstrap intervals replay exactly. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
