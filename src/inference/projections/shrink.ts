// Shrinkage primitive (REGISTRY §2.1, ENGINE_PRECEDENT *-model/shrinkage.ts):
//   shrink(x, prior, k) with sample n = (n·x + k·prior) / (n + k)

export function shrink(x: number, prior: number, k: number, n: number): number {
  const denom = n + k;
  if (denom <= 0) return prior;
  return (n * x + k * prior) / denom;
}
