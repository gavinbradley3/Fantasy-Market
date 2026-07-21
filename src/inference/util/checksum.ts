// Checksum + canonical serialization helpers (SPEC §15.3, §18.2; REGISTRY §1).
//
// Reuses the repository's deterministic FNV-1a hash (`src/pipeline/hash.ts`) — the
// pipeline is shared infrastructure, not a frozen valuation engine, so importing it
// introduces no engine coupling.

import { digest, fnv1a32 } from '@/pipeline/hash';

export { digest, fnv1a32 };

/**
 * Deterministic JSON with recursively sorted object keys and no whitespace
 * (SPEC §15.3 canonical form for the normalized-input checksum).
 *
 * NOTE on number rendering: this uses the host `JSON.stringify` number format
 * (e.g. `4.0` → "4"). It is suitable for hashing provider FACTS, whose values are
 * finite decimals produced by the same runtime. Artifacts whose checksum was fixed
 * against a specific textual form (e.g. the canonical environment reference, whose
 * checksum was computed against a string containing "4.0") MUST hash their literal
 * canonical string, not a re-serialization — see `registry/envReference.ts`.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      out[key] = sortKeysDeep(input[key]);
    }
    return out;
  }
  return value;
}

/** Checksum of an arbitrary serializable value via the canonical form + `digest`. */
export function checksumOf(value: unknown): string {
  return digest(stableStringify(value));
}
