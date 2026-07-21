// Deterministic ordering helpers (SPEC §25.2 / §15.1, REGISTRY §15.1).
//
// All ordering is locale-independent ordinal (UTF-16 code-unit) string comparison.
// No comparator here depends on object-key iteration order or the filesystem.

/** Ordinal string comparison (`<` on strings is code-unit order, locale-free). */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Stable sort by a string key extractor, ascending ordinal. Returns a new array;
 * the input is not mutated. (Array.prototype.sort is stable per spec since ES2019.)
 */
export function stableSortByKey<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => compareStrings(key(a), key(b)));
}

/**
 * Stable sort by an ordered list of string comparators (first non-zero wins).
 * Used where a primary key ties and a secondary tie-break applies
 * (e.g. REGISTRY §20.F10 snapshot ties broken by snapshotId).
 */
export function stableSortBy<T>(items: readonly T[], keys: readonly ((item: T) => string)[]): T[] {
  return [...items].sort((a, b) => {
    for (const key of keys) {
      const c = compareStrings(key(a), key(b));
      if (c !== 0) return c;
    }
    return 0;
  });
}
