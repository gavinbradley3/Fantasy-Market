import { describe, expect, it } from 'vitest';
import { ingest } from './buildInput';
import { nflverseSource, sleeperSource } from './__fixtures';

describe('snapshot reproducibility & identity linking', () => {
  it('two identical payload sets produce a byte-identical snapshot id', () => {
    const a = ingest([nflverseSource(), sleeperSource()]);
    const b = ingest([nflverseSource(), sleeperSource()]);
    expect(a.snapshot.snapshotId).toBe(b.snapshot.snapshotId);
    expect(JSON.stringify(a.snapshot)).toBe(JSON.stringify(b.snapshot));
  });

  it('provider order does not change the snapshot (canonical ordering)', () => {
    const a = ingest([nflverseSource(), sleeperSource()]);
    const b = ingest([sleeperSource(), nflverseSource()]);
    expect(a.snapshot.snapshotId).toBe(b.snapshot.snapshotId);
  });

  it('cross-provider identity join: WR resolves to one canonical id across nflverse+sleeper', () => {
    const { snapshot } = ingest([nflverseSource(), sleeperSource()]);
    const wr = snapshot.players.filter((p) => p.providerIds.gsis === '00-WR');
    const ids = new Set(wr.map((p) => p.canonicalId));
    expect(ids.size).toBe(1); // both providers' WR rows share one canonical id
    // the sleeper injury record links to that same canonical id
    const wrId = [...ids][0];
    expect(snapshot.injuries.some((i) => i.canonicalId === wrId)).toBe(true);
  });

  it('unsupported-position row is discarded and reported', () => {
    const { snapshot, diagnostics } = ingest([nflverseSource(), sleeperSource()]);
    expect(snapshot.players.some((p) => p.providerIds.gsis === '00-K')).toBe(true); // identity kept
    expect(diagnostics.warnings.some((w) => w.code === 'UNSUPPORTED_POSITION')).toBe(true);
  });

  it('collections are canonically ordered (games ascending by canonical|kickoff)', () => {
    const { snapshot } = ingest([nflverseSource(), sleeperSource()]);
    const keys = snapshot.games.map((g) => `${g.canonicalId}|${g.kickoff}|${g.gameId}`);
    expect(keys).toEqual([...keys].sort());
  });
});
