// The staging CLI: a large ranking change is held for review and approval is checksum-bound.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function board(order: string[], publishedAt: string) {
  return {
    publication: { publicationId: 'board-x', runId: 'run-x', boardChecksum: 'x', snapshotId: 's', entryCount: order.length, publishedAt },
    entries: order.map((id, i) => ({ canonicalId: id, position: 'WR', name: id, dynastyOverallRank: i + 1, dynastyValue: 100 - i, asOf: '2026-11-12T00:00:00.000Z', outputStatus: 'AVAILABLE' })),
  };
}

const ids = Array.from({ length: 150 }, (_, i) => `p${i}`);

function setup(candidateOrder: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'pt-stage-'));
  mkdirSync(join(dir, 'candidate'));
  writeFileSync(join(dir, 'candidate', 'board.json'), JSON.stringify(board(candidateOrder, '2026-11-12T14:00:00.000Z')));
  writeFileSync(join(dir, 'reference.json'), JSON.stringify(board(ids, '2026-09-12T00:00:00.000Z')));
  return dir;
}

function run(dir: string, extra: string[] = []) {
  return spawnSync('npx', ['tsx', 'scripts/stage-board.ts', '--candidate', join(dir, 'candidate'), '--reference', join(dir, 'reference.json'), '--out', join(dir, 'out'), ...extra], {
    encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: './tsconfig.app.json' },
  });
}

const manifest = (dir: string) => JSON.parse(readFileSync(join(dir, 'out', 'staging-manifest.json'), 'utf8'));

describe('stage:board', () => {
  it('passes an unchanged board with no review', () => {
    const dir = setup(ids);
    const r = run(dir);
    expect(r.status).toBe(0);
    expect(manifest(dir).reviewStatus).toBe('NOT_REQUIRED');
  });

  it('refuses a reordered board without review, and never reports success', () => {
    const dir = setup([...ids].reverse());
    const r = run(dir);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('ranking change requires owner review');
    expect(manifest(dir).reviewStatus).toBe('PENDING_OWNER_REVIEW');
  });

  it('staging may write a pending board, which stays marked pending', () => {
    const dir = setup([...ids].reverse());
    expect(run(dir, ['--allow-pending-review']).status).toBe(0);
    expect(manifest(dir).reviewStatus).toBe('PENDING_OWNER_REVIEW');
  });

  it('approval is bound to the exact valuation checksum', () => {
    const dir = setup([...ids].reverse());
    run(dir, ['--allow-pending-review']);
    const checksum = manifest(dir).valuation.checksum as string;
    expect(run(dir, ['--approve', 'not-this-board']).status).toBe(3);
    const ok = run(dir, ['--approve', checksum]);
    expect(ok.status).toBe(0);
    expect(manifest(dir).reviewStatus).toBe('APPROVED_BY_OWNER');
  });

  it('separates valuation content from publication metadata', () => {
    const dir = setup(ids);
    run(dir);
    const first = manifest(dir);
    // Same valuations, different publish time.
    const b = board(ids, '2026-11-13T09:00:00.000Z');
    writeFileSync(join(dir, 'candidate', 'board.json'), JSON.stringify(b));
    run(dir);
    const second = manifest(dir);
    expect(second.valuation.checksum).toBe(first.valuation.checksum);
    expect(second.metadata.publishedAt).not.toBe(first.metadata.publishedAt);
  });
});
