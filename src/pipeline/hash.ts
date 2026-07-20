// Deterministic, dependency-free hashing used for two things:
//   1. minting a stable canonical id from the strongest available provider id
//      when no prior mapping exists;
//   2. a content checksum for raw snapshots.
//
// FNV-1a (32-bit) is not cryptographic — it does not need to be. It only needs
// to be deterministic across platforms and runs, which it is (pure integer
// math, no locale, no time).

export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply, kept in integer range via Math.imul.
    hash = Math.imul(hash, 0x01000193);
  }
  // Unsigned, zero-padded to 8 hex chars.
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** A longer digest via two differently-salted passes, for snapshot checksums. */
export function digest(input: string): string {
  return fnv1a32('a:' + input) + fnv1a32('b:' + input);
}
