// PublicationService (Phase 8). Read-only access to published boards. It DELEGATES entirely
// to the persistence read port — it never recomputes board identity, re-verifies integrity,
// or re-orders entries (persistence already does, authoritatively). It only projects the
// publication record into a stable metadata DTO and passes the fully-materialized bundle
// through unchanged. A read that throws is normalized to a PERSISTENCE_UNAVAILABLE error with
// the original code preserved on `cause`.

import { ApplicationError, underlyingCode } from './errors';
import type { PublicationMetadata, PublicationReadPort } from './types';
import type { PublicationBundle, PublicationRecord } from '@/persistence';

function toMetadata(r: PublicationRecord): PublicationMetadata {
  return {
    publicationId: r.publicationId,
    runId: r.runId,
    snapshotId: r.snapshotId,
    boardChecksum: r.boardChecksum,
    entryCount: r.entryCount,
    publishedAt: r.publishedAt,
    supersededPublicationId: r.supersededPublicationId,
  };
}

export class PublicationService {
  constructor(private readonly store: PublicationReadPort) {}

  private guard<T>(op: string, fn: () => T): T {
    try {
      return fn();
    } catch (err) {
      throw new ApplicationError('PERSISTENCE_UNAVAILABLE', `publication read failed: ${op}`, {
        cause: err,
        detail: underlyingCode(err),
      });
    }
  }

  /** The current published board, fully materialized and integrity-checked by persistence. */
  currentPublication(): PublicationBundle | null {
    return this.guard('currentPublication', () => this.store.getCurrentPublication());
  }

  /** Metadata for the current publication (no materialized entries), or null if none. */
  currentPublicationMetadata(): PublicationMetadata | null {
    return this.guard('currentPublicationMetadata', () => {
      const rec = this.store.getCurrentPublicationRecord();
      return rec ? toMetadata(rec) : null;
    });
  }

  /** Metadata for a specific publication by id, or null if it does not exist. */
  publicationMetadata(publicationId: string): PublicationMetadata | null {
    if (!publicationId) throw new ApplicationError('INVALID_ARGUMENT', 'publicationId is required');
    return this.guard('publicationMetadata', () => {
      const rec = this.store.getPublicationRecord(publicationId);
      return rec ? toMetadata(rec) : null;
    });
  }

  /** Publication history, newest first, as metadata (default cap mirrors persistence: 100). */
  publicationHistory(limit = 100): PublicationMetadata[] {
    return this.guard('publicationHistory', () => this.store.getPublicationHistory(limit).map(toMetadata));
  }

  /** The deterministic board checksum of the current publication, or null if none. */
  latestBoardChecksum(): string | null {
    return this.guard('latestBoardChecksum', () => this.store.getCurrentPublicationRecord()?.boardChecksum ?? null);
  }
}
