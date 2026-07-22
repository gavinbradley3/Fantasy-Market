// Replay transport (Phase 5). Loads a previously CAPTURED envelope from the store and
// verifies its integrity — performing NO network access — so a stored payload reproduces
// the exact same adapter input, snapshot, and inference as the original ingestion attempt.
// The original provider/capability and source `fetchedAt` are preserved; replay time is a
// separate, operational concern owned by the orchestrator, never mixed into the envelope.

import { verifyEnvelope } from './envelope';
import { TransportError } from './errors';
import { computeRequestKey } from './registry';
import type { RawPayloadStore } from './store';
import type { IngestionProvider, ProviderCapability, RawPayloadEnvelope } from './types';

/** Load the latest captured envelope for a logical request and verify its checksum. */
export async function loadReplayEnvelope(
  store: RawPayloadStore,
  provider: IngestionProvider,
  capability: ProviderCapability,
  params: Readonly<Record<string, string>> = {},
): Promise<RawPayloadEnvelope> {
  const requestKey = computeRequestKey(provider, capability, params);
  const envelope = await store.getLatest(provider, capability, requestKey);
  if (!envelope) {
    throw new TransportError('MISSING_REPLAY_PAYLOAD', `no captured payload to replay for ${requestKey}`, {
      provider,
      capability,
      requestKey,
      retryable: false,
      stage: 'replay',
    });
  }
  // Integrity gate: a corrupted payload can NEVER reach the adapter/ingestion boundary.
  verifyEnvelope(envelope);
  return envelope;
}

/** Load a specific captured envelope by checksum and verify it (targeted replay). */
export async function loadReplayEnvelopeByChecksum(
  store: RawPayloadStore,
  checksum: string,
): Promise<RawPayloadEnvelope> {
  const envelope = await store.getByChecksum(checksum);
  if (!envelope) {
    throw new TransportError('MISSING_REPLAY_PAYLOAD', `no captured payload with checksum ${checksum}`, {
      retryable: false,
      stage: 'replay',
    });
  }
  verifyEnvelope(envelope);
  return envelope;
}
