// In-memory RawPayloadStore (Phase 5) for tests and local execution. Deterministic:
// keyed by checksum, with a secondary index by logical-request coordinate. No I/O, no
// clock, no eviction — a captured payload stays available for replay for the process life.

import { requestCoordinate, selectLatest, type RawPayloadStore } from './store';
import type { RawPayloadEnvelope } from './types';

export class MemoryPayloadStore implements RawPayloadStore {
  private readonly byChecksum = new Map<string, RawPayloadEnvelope>();
  private readonly byCoordinate = new Map<string, Set<string>>();

  put(envelope: RawPayloadEnvelope): Promise<void> {
    // Idempotent by checksum — identical bytes never create a second entry.
    if (!this.byChecksum.has(envelope.payloadChecksum)) {
      this.byChecksum.set(envelope.payloadChecksum, envelope);
    }
    const coord = requestCoordinate(envelope);
    let set = this.byCoordinate.get(coord);
    if (!set) {
      set = new Set();
      this.byCoordinate.set(coord, set);
    }
    set.add(envelope.payloadChecksum);
    return Promise.resolve();
  }

  getByChecksum(checksum: string): Promise<RawPayloadEnvelope | null> {
    return Promise.resolve(this.byChecksum.get(checksum) ?? null);
  }

  getLatest(
    provider: RawPayloadEnvelope['provider'],
    capability: RawPayloadEnvelope['capability'],
    requestKey: string,
  ): Promise<RawPayloadEnvelope | null> {
    const coord = `${provider}|${capability}|${requestKey}`;
    const checksums = this.byCoordinate.get(coord);
    if (!checksums || checksums.size === 0) return Promise.resolve(null);
    const candidates: RawPayloadEnvelope[] = [];
    for (const c of checksums) {
      const env = this.byChecksum.get(c);
      if (env) candidates.push(env);
    }
    return Promise.resolve(selectLatest(candidates));
  }

  /** Test/diagnostic helper: number of distinct payloads held. */
  size(): number {
    return this.byChecksum.size;
  }
}
