// Raw-payload store SEAM (Phase 5). An interface, not a database. It persists raw
// envelopes so a captured payload can be replayed without the network and so conditional
// requests can revalidate against the latest capture. Phase 5 ships an in-memory and a
// simple filesystem implementation; database persistence is explicitly deferred (Phase 6+).

import type { RawPayloadEnvelope } from './types';

export interface RawPayloadStore {
  /** Persist an envelope. Idempotent by checksum: re-putting the same bytes is a no-op. */
  put(envelope: RawPayloadEnvelope): Promise<void>;

  /** Fetch by exact payload checksum, or null if absent. */
  getByChecksum(checksum: string): Promise<RawPayloadEnvelope | null>;

  /**
   * The most recently captured envelope for a logical request (provider + capability +
   * requestKey), by fetchedAt then checksum for a deterministic tie-break, or null.
   */
  getLatest(
    provider: RawPayloadEnvelope['provider'],
    capability: RawPayloadEnvelope['capability'],
    requestKey: string,
  ): Promise<RawPayloadEnvelope | null>;
}

/** Deterministic "latest" selection: newest fetchedAt wins; checksum breaks ties. */
export function selectLatest(candidates: readonly RawPayloadEnvelope[]): RawPayloadEnvelope | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    if (a.fetchedAt !== b.fetchedAt) return a.fetchedAt < b.fetchedAt ? 1 : -1; // newest first
    return a.payloadChecksum < b.payloadChecksum ? 1 : -1;
  })[0];
}

/** The logical-request coordinate used to group envelopes for `getLatest`. */
export function requestCoordinate(envelope: RawPayloadEnvelope): string {
  return `${envelope.provider}|${envelope.capability}|${envelope.requestKey}`;
}
