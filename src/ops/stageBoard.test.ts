// The staging CLI: a large ranking change is held for review and approval is checksum-bound.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  writeFileSync(join(dir, 'verification.json'), JSON.stringify({ publicationId: 'board-x', hardPass: true, checks: {} }));
  writeFileSync(join(dir, 'run.log'), 'ingest output\n');
  return dir;
}

function run(dir: string, extra: string[] = []) {
  return spawnSync('npx', ['tsx', 'scripts/stage-board.ts', '--candidate', join(dir, 'candidate'), '--reference', join(dir, 'reference.json'),
    '--verification', join(dir, 'verification.json'), '--run-log', join(dir, 'run.log'), '--out', join(dir, 'out'), ...extra], {
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

  it('writes a complete, matching artifact set and removes anything left from an earlier run', () => {
    const dir = setup(ids);
    mkdirSync(join(dir, 'out'), { recursive: true });
    writeFileSync(join(dir, 'out', 'REVIEW.md'), 'an OLD review for another board');
    writeFileSync(join(dir, 'out', 'stale.json'), '{}');
    expect(run(dir).status).toBe(0);
    const m = manifest(dir);
    expect(Object.keys(m.artifacts).sort()).toEqual(['REVIEW.md', 'board.json', 'run-log.txt', 'verification.json']);
    expect(existsSync(join(dir, 'out', 'stale.json'))).toBe(false);
    const review = readFileSync(join(dir, 'out', 'REVIEW.md'), 'utf8');
    expect(review).toContain(m.valuation.checksum);
    expect(review).not.toContain('an OLD review');
  });

  it('refuses a verification report written for a different board', () => {
    const dir = setup(ids);
    writeFileSync(join(dir, 'verification.json'), JSON.stringify({ publicationId: 'board-other', hardPass: true }));
    const r = run(dir);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('verification report is for board-other');
  });

  it('a failed verification never reports success', () => {
    const dir = setup(ids);
    writeFileSync(join(dir, 'verification.json'), JSON.stringify({ publicationId: 'board-x', hardPass: false, checks: {} }));
    const r = run(dir, ['--allow-pending-review']);
    expect(r.status).toBe(1);
    expect(manifest(dir).verificationPassed).toBe(false);
  });
});
