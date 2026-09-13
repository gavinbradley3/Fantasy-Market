// The static export and the market-history seed — the two pieces that make an ephemeral runner
// safe. Both exercised end to end against a real SQLite database, with no network.

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PersistenceStore } from '@/persistence';
import { persistRefreshResult } from '@/persistence/persistRefreshResult';
import { mockedFailedRefresh, mockedSuccessfulRefresh } from '@/persistence/__fixtures';
import type { MarketSnapshot } from '@/market';

const NOW = '2026-09-12T18:00:00.000Z';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'pt-ops-'));
}

function run(script: string, args: readonly string[]): string {
  return execFileSync('npx', ['tsx', script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, TSX_TSCONFIG_PATH: './tsconfig.app.json' },
  });
}

function quote(id: string, over: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    canonicalPlayerId: id,
    source: 'dynastyprocess',
    format: 'dynasty_superflex',
    value: 5000,
    overallRank: 1,
    positionRank: 1,
    sourceConsensusRank: null,
    sourcePlayerId: id,
    sourcePosition: 'WR',
    sourceTeam: 'CIN',
    sourceTimestamp: '2026-09-11T00:00:00.000Z',
    ingestedAt: '2026-09-12T00:00:00.000Z',
    sourceVersion: null,
    freshness: 'fresh',
    provenance: 'external',
    ...over,
  } as MarketSnapshot;
}

describe('static export', () => {
  it('persists a failed attempt beside byte-identical last-good board, then clears it on retry', async () => {
    const dir = tempDir();
    const out = tempDir();
    const dbPath = join(dir, 'board.db');
    const store = PersistenceStore.open(dbPath, () => '2026-09-12T12:00:00.000Z');
    const complete = await mockedSuccessfulRefresh();
    const good = persistRefreshResult(store, {
      result: complete.result, inferenceBuilds: complete.builds, requiredProviders: ['nflverse'],
      runId: 'run-good', startedAt: '2026-09-12T11:59:00.000Z', completedAt: '2026-09-12T12:00:00.000Z',
    });
    const publication = store.publishBoard({ runId: good.runId });
    store.close();

    run('scripts/export-site-data.ts', ['--db', dbPath, '--out', out, '--now', NOW, '--dataset', 'board']);
    const before = readFileSync(join(out, 'board.json'));

    const failedDbPath = join(dir, 'failed.db');
    const failedStore = PersistenceStore.open(failedDbPath);
    const failed = await mockedFailedRefresh();
    persistRefreshResult(failedStore, {
      result: failed.result, requiredProviders: ['nflverse'], runId: 'run-failed',
      startedAt: '2026-09-12T17:00:00.000Z', completedAt: '2026-09-12T17:01:00.000Z',
    });
    failedStore.close();
    run('scripts/export-site-data.ts', [
      '--db', failedDbPath, '--out', out, '--now', NOW, '--dataset', 'board',
      '--attempt-outcome', 'failure', '--attempt-at', '2026-09-12T17:01:00.000Z',
    ]);
    expect(readFileSync(join(out, 'board.json'))).toEqual(before);
    const failedStatus = JSON.parse(readFileSync(join(out, 'status.json'), 'utf8'));
    expect(failedStatus.board).toMatchObject({
      publicationId: publication.publicationId, checksum: publication.boardChecksum,
      publishedAt: publication.publishedAt,
      lastAttempt: { attemptedAt: '2026-09-12T17:01:00.000Z', outcome: 'failure' },
    });
    expect(failedStatus.lastRun.servingLastKnownGood).toBe(true);

    const retryDbPath = join(dir, 'retry.db');
    const retryStore = PersistenceStore.open(retryDbPath, () => '2026-09-12T17:31:00.000Z');
    persistRefreshResult(retryStore, {
      result: complete.result, inferenceBuilds: complete.builds, requiredProviders: ['nflverse'],
      runId: 'run-retry', startedAt: '2026-09-12T17:30:00.000Z', completedAt: '2026-09-12T17:31:00.000Z',
    });
    retryStore.publishBoard({ runId: 'run-retry' });
    retryStore.close();
    run('scripts/export-site-data.ts', ['--db', retryDbPath, '--out', out, '--now', NOW, '--dataset', 'board']);
    const retryStatus = JSON.parse(readFileSync(join(out, 'status.json'), 'utf8'));
    expect(retryStatus.board.lastAttempt.outcome).toBe('success');
    // Content-addressed publication ids can remain stable when a retry republishes identical
    // values; the newer publication timestamp and success attempt are the replacement evidence.
    expect(retryStatus.board.publicationId).toBe(publication.publicationId);
    expect(retryStatus.board.publishedAt).toBe('2026-09-12T17:31:00.000Z');
    expect(readFileSync(join(out, 'board.json'))).not.toEqual(before);
  });

  it('preserves the other dataset status when a board-only temporary database is exported', () => {
    const dir = tempDir();
    const out = tempDir();
    writeFileSync(join(out, 'status.json'), JSON.stringify({
      generatedAt: '2026-09-12T17:00:00.000Z',
      board: { state: 'unknown', publishedAt: null, ageHours: null, entryCount: null, checksum: null, currentWithinHours: 12 },
      market: { state: 'current', capturedAt: '2026-09-12T16:00:00.000Z', sourceTimestamp: '2026-09-12T00:00:00.000Z', ageHours: 1, quoteCount: 439, historyAppended: true, currentWithinHours: 336 },
      providers: {}, lastRun: {}, overall: 'degraded',
    }));
    const store = PersistenceStore.open(join(dir, 'board-only.db'));
    store.close();

    run('scripts/export-site-data.ts', [
      '--db', join(dir, 'board-only.db'), '--out', out, '--now', NOW, '--dataset', 'board',
    ]);
    const status = JSON.parse(readFileSync(join(out, 'status.json'), 'utf8'));
    expect(status.market.capturedAt).toBe('2026-09-12T16:00:00.000Z');
    expect(status.market.quoteCount).toBe(439);
  });

  it('marks last-good service when failure happens before a temporary database records a run', async () => {
    const dir = tempDir();
    const out = tempDir();
    const boardDb = join(dir, 'board.db');
    const boardStore = PersistenceStore.open(boardDb, () => '2026-09-12T12:00:00.000Z');
    const complete = await mockedSuccessfulRefresh();
    const persisted = persistRefreshResult(boardStore, {
      result: complete.result, inferenceBuilds: complete.builds, requiredProviders: ['nflverse'],
      runId: 'run-board', startedAt: '2026-09-12T11:59:00.000Z', completedAt: '2026-09-12T12:00:00.000Z',
    });
    boardStore.publishBoard({ runId: persisted.runId });
    boardStore.close();
    run('scripts/export-site-data.ts', ['--db', boardDb, '--out', out, '--now', NOW, '--dataset', 'board']);

    const emptyDb = join(dir, 'failed-before-run.db');
    PersistenceStore.open(emptyDb).close();
    run('scripts/export-site-data.ts', [
      '--db', emptyDb, '--out', out, '--now', NOW, '--dataset', 'board',
      '--attempt-outcome', 'failure', '--attempt-at', NOW,
    ]);
    const status = JSON.parse(readFileSync(join(out, 'status.json'), 'utf8'));
    expect(status.board.lastAttempt).toEqual({ attemptedAt: NOW, outcome: 'failure' });
    expect(status.lastRun).toMatchObject({ completedAt: NOW, status: 'failure', servingLastKnownGood: true });
  });

  it('preserves board identity and bytes when a market-only database regenerates status', async () => {
    const dir = tempDir();
    const out = tempDir();
    const boardDb = join(dir, 'board.db');
    const boardStore = PersistenceStore.open(boardDb, () => '2026-09-12T12:00:00.000Z');
    const complete = await mockedSuccessfulRefresh();
    const persisted = persistRefreshResult(boardStore, {
      result: complete.result, inferenceBuilds: complete.builds, requiredProviders: ['nflverse'],
      runId: 'run-board', startedAt: '2026-09-12T11:59:00.000Z', completedAt: '2026-09-12T12:00:00.000Z',
    });
    const publication = boardStore.publishBoard({ runId: persisted.runId });
    boardStore.close();
    run('scripts/export-site-data.ts', ['--db', boardDb, '--out', out, '--now', NOW, '--dataset', 'board']);
    const boardBytes = readFileSync(join(out, 'board.json'));

    const marketDb = join(dir, 'market.db');
    const marketStore = PersistenceStore.open(marketDb);
    marketStore.appendMarketSnapshots([quote('pt-a')]);
    marketStore.close();
    run('scripts/export-site-data.ts', [
      '--db', marketDb, '--out', out, '--now', NOW, '--dataset', 'market',
      '--attempt-outcome', 'success', '--attempt-at', NOW,
    ]);

    expect(readFileSync(join(out, 'board.json'))).toEqual(boardBytes);
    const status = JSON.parse(readFileSync(join(out, 'status.json'), 'utf8'));
    expect(status.board).toMatchObject({
      publicationId: publication.publicationId,
      checksum: publication.boardChecksum,
      publishedAt: publication.publishedAt,
    });
    expect(status.market.lastAttempt).toEqual({ attemptedAt: NOW, outcome: 'success' });
  });

  it('does not rebind a mismatched prior failure to the board during a market-only export', async () => {
    const dir = tempDir();
    const out = tempDir();
    const boardDb = join(dir, 'board.db');
    const boardStore = PersistenceStore.open(boardDb, () => '2026-09-12T12:00:00.000Z');
    const complete = await mockedSuccessfulRefresh();
    const persisted = persistRefreshResult(boardStore, {
      result: complete.result, inferenceBuilds: complete.builds, requiredProviders: ['nflverse'],
      runId: 'run-board', startedAt: '2026-09-12T11:59:00.000Z', completedAt: '2026-09-12T12:00:00.000Z',
    });
    boardStore.publishBoard({ runId: persisted.runId });
    boardStore.close();
    run('scripts/export-site-data.ts', ['--db', boardDb, '--out', out, '--now', NOW, '--dataset', 'board']);
    const mismatched = JSON.parse(readFileSync(join(out, 'status.json'), 'utf8'));
    mismatched.board.publicationId = 'different-publication';
    mismatched.board.lastAttempt = { attemptedAt: NOW, outcome: 'failure' };
    writeFileSync(join(out, 'status.json'), JSON.stringify(mismatched));

    const marketDb = join(dir, 'market.db');
    const marketStore = PersistenceStore.open(marketDb);
    marketStore.appendMarketSnapshots([quote('pt-a')]);
    marketStore.close();
    run('scripts/export-site-data.ts', [
      '--db', marketDb, '--out', out, '--now', NOW, '--dataset', 'market',
      '--attempt-outcome', 'success', '--attempt-at', NOW,
    ]);
    const regenerated = JSON.parse(readFileSync(join(out, 'status.json'), 'utf8'));
    expect(regenerated.board.publicationId).not.toBe('different-publication');
    expect(regenerated.board.lastAttempt).toBeNull();
  });

  it('writes NO board and says so when nothing is published, leaving a previous export intact', () => {
    // The last-known-good guarantee at the export layer: a database with no publication must not
    // produce an empty board that would overwrite a good one.
    const dir = tempDir();
    const out = tempDir();
    writeFileSync(join(out, 'board.json'), '{"previous":"board"}');
    const store = PersistenceStore.open(join(dir, 'empty.db'));
    store.close();

    const log = run('scripts/export-site-data.ts', ['--db', join(dir, 'empty.db'), '--out', out, '--now', NOW]);
    expect(log).toContain('board.json          SKIPPED');
    // Untouched.
    expect(JSON.parse(readFileSync(join(out, 'board.json'), 'utf8'))).toEqual({ previous: 'board' });

    const status = JSON.parse(readFileSync(join(out, 'status.json'), 'utf8'));
    expect(status.board.state).toBe('unknown');
    expect(status.overall).toBe('degraded');
    // A missing market snapshot is reported as missing, never as empty-but-current.
    expect(status.market.state).toBe('unknown');
    expect(status.market.quoteCount).toBe(0);
  });

  it('appends one market history line per capture and never duplicates one', () => {
    const dir = tempDir();
    const out = tempDir();
    const dbPath = join(dir, 'market.db');
    const store = PersistenceStore.open(dbPath);
    store.appendMarketSnapshots([quote('pt-a'), quote('pt-b', { overallRank: 2, positionRank: 2, value: 4000 })]);
    store.close();

    run('scripts/export-site-data.ts', ['--db', dbPath, '--out', out, '--now', NOW]);
    const historyPath = join(out, 'market-history.jsonl');
    expect(existsSync(historyPath)).toBe(true);
    const afterFirst = readFileSync(historyPath, 'utf8').trim().split('\n');
    expect(afterFirst).toHaveLength(1);

    // Re-exporting the SAME capture must not add a line. Re-running a job is safe.
    const second = run('scripts/export-site-data.ts', ['--db', dbPath, '--out', out, '--now', NOW]);
    expect(second).toContain('already recorded');
    expect(readFileSync(historyPath, 'utf8').trim().split('\n')).toHaveLength(1);
  });
});

describe('market history seed', () => {
  it('restores a committed history into a fresh database, so append-only survives an ephemeral runner', () => {
    const dir = tempDir();
    const out = tempDir();

    // Capture one, exported and "committed".
    const firstDb = join(dir, 'first.db');
    const s1 = PersistenceStore.open(firstDb);
    s1.appendMarketSnapshots([quote('pt-a', { ingestedAt: '2026-09-01T00:00:00.000Z' })]);
    s1.close();
    run('scripts/export-site-data.ts', ['--db', firstDb, '--out', out, '--now', NOW]);

    // A NEW runner, a NEW empty database — as a scheduled job actually starts.
    const secondDb = join(dir, 'second.db');
    const seeded = run('scripts/seed-market-history.ts', [
      '--db', secondDb, '--history', join(out, 'market-history.jsonl'),
    ]);
    expect(seeded).toContain('seeded 1 capture');

    const s2 = PersistenceStore.open(secondDb);
    try {
      // The earlier capture is present, so the next capture appends to real history rather than
      // believing it is the first ever.
      expect(s2.getMarketCaptureInstants('dynastyprocess', 'dynasty_superflex')).toContain('2026-09-01T00:00:00.000Z');
    } finally {
      s2.close();
    }
  });

  it('treats a missing history as a first run, not an error', () => {
    const dir = tempDir();
    const log = run('scripts/seed-market-history.ts', [
      '--db', join(dir, 'fresh.db'), '--history', join(dir, 'does-not-exist.jsonl'),
    ]);
    expect(log).toContain('first run');
  });

  it('skips an unparseable line, leaves it in place, and still seeds the good ones', () => {
    const dir = tempDir();
    const historyPath = join(dir, 'history.jsonl');
    const good = JSON.stringify({
      source: 'dynastyprocess',
      format: 'dynasty_superflex',
      capturedAt: '2026-09-01T00:00:00.000Z',
      quotes: [quote('pt-a', { ingestedAt: '2026-09-01T00:00:00.000Z' })],
    });
    writeFileSync(historyPath, `${good}\nnot json at all\n`);

    const log = run('scripts/seed-market-history.ts', ['--db', join(dir, 'db.db'), '--history', historyPath]);
    expect(log).toContain('seeded 1 capture');
    expect(log).toContain('1 unparseable line');
    // The file is append-only history; a bad line is never rewritten out of it.
    expect(readFileSync(historyPath, 'utf8')).toContain('not json at all');
  });
});
