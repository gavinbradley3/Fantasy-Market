// PublicationService tests (Phase 8): delegation to the persistence read port, metadata
// projection, history, board checksum, not-found handling, and error normalization. The
// service recomputes nothing — it projects records and passes bundles through.

import { describe, expect, it } from 'vitest';
import { PublicationService } from './PublicationService';
import { ApplicationError } from './errors';
import { FakeStore, pubRecord } from './__fixtures';

describe('publication reads', () => {
  it('projects current publication metadata', () => {
    const store = new FakeStore();
    const svc = new PublicationService(store);
    expect(svc.currentPublicationMetadata()).toEqual({
      publicationId: 'pub-1', runId: 'run-manual-T-1', snapshotId: 'snap-1', boardChecksum: 'checksum-abc',
      entryCount: 3, publishedAt: '2026-01-01T00:00:00.000Z', supersededPublicationId: null,
    });
  });

  it('returns null current metadata when nothing is published', () => {
    const store = new FakeStore();
    store.current = null;
    expect(new PublicationService(store).currentPublicationMetadata()).toBeNull();
    expect(new PublicationService(store).latestBoardChecksum()).toBeNull();
  });

  it('passes the fully-materialized current bundle through unchanged', () => {
    const store = new FakeStore();
    const bundle = { publication: pubRecord(), run: {} as never, sources: [], snapshot: {} as never, entries: [] };
    store.currentBundle = bundle as never;
    expect(new PublicationService(store).currentPublication()).toBe(bundle);
  });

  it('looks up a publication by id and returns null when unknown', () => {
    const svc = new PublicationService(new FakeStore());
    expect(svc.publicationMetadata('pub-1')?.publicationId).toBe('pub-1');
    expect(svc.publicationMetadata('nope')).toBeNull();
  });

  it('rejects an empty publication id', () => {
    expect(() => new PublicationService(new FakeStore()).publicationMetadata('')).toThrow(ApplicationError);
  });

  it('returns history as projected metadata and exposes the latest board checksum', () => {
    const store = new FakeStore();
    store.historyList = [pubRecord({ publicationId: 'p2' }), pubRecord({ publicationId: 'p1' })];
    const svc = new PublicationService(store);
    expect(svc.publicationHistory().map((p) => p.publicationId)).toEqual(['p2', 'p1']);
    expect(svc.latestBoardChecksum()).toBe('checksum-abc');
  });

  it('normalizes a read failure to PERSISTENCE_UNAVAILABLE, preserving the original code', () => {
    const store = new FakeStore();
    store.throwOn.add('getCurrentPublicationRecord');
    const err = (() => { try { new PublicationService(store).currentPublicationMetadata(); } catch (e) { return e as ApplicationError; } })();
    expect(err).toBeInstanceOf(ApplicationError);
    expect(err?.code).toBe('PERSISTENCE_UNAVAILABLE');
    expect(err?.detail).toBe('READ_FAILURE'); // underlying persistence code preserved, not rewritten
  });
});
