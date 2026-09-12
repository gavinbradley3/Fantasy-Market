// The static export and the market-history seed — the two pieces that make an ephemeral runner
// safe. Both exercised end to end against a real SQLite database, with no network.

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PersistenceStore } from '@/persistence';
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
