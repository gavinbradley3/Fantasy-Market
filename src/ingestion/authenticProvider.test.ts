// Phase 11 correction — the AUTHENTIC committed provider export, end to end.
//
// The rows here are not shaped for this repository: they are the provider's own weekly
// player-stats and players exports (real GSIS/Sleeper/ESPN ids, real names, the provider's
// own column vocabulary — `player_id`, `recent_team`, `season` + `week`, no timestamp).
// Nothing is reshaped before ingestion; if the adapter cannot read the real vocabulary,
// these tests fail.
//
//   authentic export → adapter → identity join → observed facts → inference
//   → readiness → frozen engine

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInference } from '@/inference/production/runInference';
import { ingest, buildNormalizedInferenceInput } from './buildInput';
import { nflverseAdapter } from './adapters/nflverse';
import { weekBoundaryIso, derivedGameId } from './weekTiming';
import type { FreshnessMeta } from './types';
import type { ProviderSource } from './buildInput';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readExport = (...p: string[]) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8')) as unknown[];

/** The provider's committed exports, used verbatim. */
const authenticPlayers = () => readExport('fixtures', 'pipeline', 'raw', 'nflverse.players.sample.json');
const authenticWeekly = () => readExport('fixtures', 'pipeline', 'stats', 'raw', 'nflverse.player_stats.sample.json');

/** As-of after the 2024 season so every 2024 row is admissible. */
const AS_OF = '2025-02-01T00:00:00.000Z';

function freshness(): FreshnessMeta {
  return {
    provider: 'nflverse',
    fetchedAt: '2025-01-15T00:00:00.000Z',
    effectiveDate: '2025-01-15T00:00:00.000Z',
    lastUpdated: null,
    sourceVersion: 'nflverse-export',
  };
}

function authenticSource(): ProviderSource {
  return {
    adapter: nflverseAdapter,
    freshness: freshness(),
    payloads: { identity: authenticPlayers(), games: authenticWeekly() },
  };
}

function board() {
  const { snapshot, diagnostics } = ingest([authenticSource()]);
  const byName = (needle: string) =>
    snapshot.players.find((p) => p.nameNormalized.includes(needle.toLowerCase()));
  return { snapshot, diagnostics, byName };
}

describe('the authentic provider export is ingested', () => {
  it('accepts the real weekly rows that the previous adapter rejected wholesale', () => {
    const rows = authenticWeekly();
    const out = nflverseAdapter.normalizeGames!(rows, freshness());
    expect(rows).toHaveLength(20);
    // 18 of 20 normalize. The export is deliberately adversarial; the only two it refuses
    // are refused for a real reason, not a vocabulary mismatch.
    expect(out.records).toHaveLength(18);
    expect(out.warnings).toHaveLength(2);
    expect(out.warnings.every((w) => w.code === 'DISCARDED_MALFORMED')).toBe(true);
    expect(out.records.every((r) => r.providerRef.value.startsWith('00-'))).toBe(true);
  });

  it('refuses exactly the rows it cannot identify or time — and nothing else', () => {
    const out = nflverseAdapter.normalizeGames!(authenticWeekly(), freshness());
    const ids = out.records.map((r) => r.providerRef.value);
    // Dropped: the row with no player_id, and the row whose week is the string "NA"
    // (no week ⇒ no derivable game key or ordering instant).
    expect(ids).not.toContain('00-0033921'); // Mike Williams, week "NA"
    // Kept even though they are unusual — filtering them is not this layer's job.
    expect(ids).toContain('00-9999999'); // unmatched ghost id
    expect(ids).toContain('00-0000777'); // kicker
  });

  it('reads the provider vocabulary: player_id, recent_team, season+week', () => {
    const out = nflverseAdapter.normalizeGames!(authenticWeekly(), freshness());
    const josh = out.records.filter((r) => r.providerRef.value === '00-0034857');
    // The export carries Josh Allen across TWO seasons plus a postseason row.
    expect(josh).toHaveLength(6);
    for (const r of josh) {
      expect(r.team).toBe('BUF');                              // from recent_team
      expect([2024, 2025]).toContain(r.season);                // from season
      expect(r.gameId).toMatch(/^20(24|25)_\d{2}_BUF$/);       // derived from season+week+team
      expect(Number.isNaN(Date.parse(r.kickoff))).toBe(false);
    }
    // Season type is read from the provider, so the postseason row is marked POST.
    expect(josh.filter((r) => r.seasonType === 'POST')).toHaveLength(1);
    expect(josh.filter((r) => r.seasonType === 'REG')).toHaveLength(5);
    // Counting columns come through as real numbers.
    const wk1 = josh.find((r) => r.gameId === '2024_01_BUF')!;
    expect(wk1.passAttempts).toBe(31);
    expect(wk1.completions).toBe(20);
    expect(wk1.passingYards).toBe(245);
    expect(wk1.passingTds).toBe(2);
    expect(wk1.interceptions).toBe(0); // a genuine ZERO, preserved
  });

  it('joins the export to canonical identities without crossing players', () => {
    const { snapshot, byName } = board();
    const josh = byName('josh allen');
    const chase = byName("ja'marr chase");
    expect(josh).toBeDefined();
    expect(chase).toBeDefined();
    expect(josh!.canonicalId).not.toBe(chase!.canonicalId);
    expect(josh!.providerIds.gsis).toBe('00-0034857');
    expect(chase!.providerIds.gsis).toBe('00-0036900');
    // Each player's games belong only to them.
    const joshGames = snapshot.games.filter((g) => g.canonicalId === josh!.canonicalId);
    const chaseGames = snapshot.games.filter((g) => g.canonicalId === chase!.canonicalId);
    expect(joshGames.length).toBeGreaterThan(0);
    expect(chaseGames.length).toBeGreaterThan(0);
    expect(joshGames.every((g) => g.providerRef.value === '00-0034857')).toBe(true);
    expect(chaseGames.every((g) => g.providerRef.value === '00-0036900')).toBe(true);
  });

  it('a row with no identifier is discarded, not guessed', () => {
    const out = nflverseAdapter.normalizeGames!(
      [{ player_display_name: 'No Identifier', position: 'WR', season: 2024, week: 1, recent_team: 'BUF' }],
      freshness(),
    );
    expect(out.records).toHaveLength(0);
    expect(out.warnings[0].code).toBe('DISCARDED_MALFORMED');
  });
});

describe('a REAL provider-backed player reaches the frozen engine', () => {
  it("Josh Allen (QB, 00-0034857) is READY and the QB engine produces a value", () => {
    const { snapshot, byName } = board();
    const josh = byName('josh allen')!;
    const input = buildNormalizedInferenceInput(snapshot, {
      canonicalId: josh.canonicalId!,
      position: 'QB',
      asOf: AS_OF,
      engineVersion: 'qb-mvp-1.0',
    })!;
    expect(input).not.toBeNull();

    // Observed counting facts came from the real export, not from anywhere else.
    expect(input.facts.career_pass_attempts).toBeGreaterThan(0);
    expect(input.facts.recent_completions).toBeGreaterThan(0);
    // As-of 2025-02-01 admits the three 2024 REG games and correctly excludes the 2025
    // ones (which fall after it) and the postseason row — proving the derived week timing
    // is doing real as-of work, not waving everything through.
    const regGames = snapshot.games.filter((g) => g.canonicalId === josh.canonicalId && g.seasonType === 'REG');
    expect(regGames).toHaveLength(5);
    expect(input.facts.career_games_played).toBe(3);
    expect(input.facts.career_pass_attempts).toBe(31 + 30 + 34);
    expect(input.facts.recent_completions).toBe(20 + 18 + 24);

    const res = runInference(input);
    expect(res.readinessStatus).toBe('READY');
    expect(res.readinessMissing).toEqual([]);
    expect(res.engineInvoked).toBe(true);
    expect(res.engineOutput).not.toBeNull();

    const out = res.engineOutput as unknown as {
      player: { player_id: string };
      composites: Record<string, number>;
      confidence: { score: number; label: string };
    };
    expect(Object.values(out.composites).every((v) => Number.isFinite(v))).toBe(true);
    expect(Object.values(out.composites).some((v) => v !== 0)).toBe(true);
    // Honest about the evidence behind it.
    expect(res.honestyState).not.toBe('COMPLETE');
    expect(res.publicConfidenceLabel).toBe('LOW');
  });

  it('the value is reproducible run to run', () => {
    const run = () => {
      const { snapshot, byName } = board();
      const josh = byName('josh allen')!;
      const input = buildNormalizedInferenceInput(snapshot, {
        canonicalId: josh.canonicalId!, position: 'QB', asOf: AS_OF, engineVersion: 'qb-mvp-1.0',
      })!;
      return runInference(input);
    };
    const a = run();
    const b = run();
    expect(a.serialized).toBe(b.serialized);
    expect(a.outputChecksum).toBe(b.outputChecksum);
  });

  it('shuffling the export rows changes nothing', () => {
    const shuffled: ProviderSource = {
      adapter: nflverseAdapter,
      freshness: freshness(),
      payloads: { identity: [...authenticPlayers()].reverse(), games: [...authenticWeekly()].reverse() },
    };
    const runWith = (src: ProviderSource) => {
      const { snapshot } = ingest([src]);
      const josh = snapshot.players.find((p) => p.providerIds.gsis === '00-0034857')!;
      const input = buildNormalizedInferenceInput(snapshot, {
        canonicalId: josh.canonicalId!, position: 'QB', asOf: AS_OF, engineVersion: 'qb-mvp-1.0',
      })!;
      return runInference(input);
    };
    expect(runWith(shuffled).outputChecksum).toBe(runWith(authenticSource()).outputChecksum);
  });
});

describe('derived week timing is an ordering key, and only a fallback', () => {
  it('a real kickoff always wins over the derived boundary', () => {
    const withKickoff = nflverseAdapter.normalizeGames!(
      [{ player_id: '00-X', recent_team: 'BUF', season: 2024, week: 1, kickoff: '2024-09-08T17:00:00.000Z', game_id: 'REAL_ID' }],
      freshness(),
    ).records[0];
    expect(withKickoff.kickoff).toBe('2024-09-08T17:00:00.000Z');
    expect(withKickoff.gameId).toBe('REAL_ID');
  });

  it('week boundaries are strictly increasing and land in the right calendar week', () => {
    // 2024: Labor Day is Mon 2 Sep, so the opener is Thu 5 Sep.
    expect(weekBoundaryIso(2024, 1)).toBe('2024-09-05T00:00:00.000Z');
    expect(weekBoundaryIso(2024, 2)).toBe('2024-09-12T00:00:00.000Z');
    // 2025: Labor Day is Mon 1 Sep, opener Thu 4 Sep.
    expect(weekBoundaryIso(2025, 1)).toBe('2025-09-04T00:00:00.000Z');
    const weeks = Array.from({ length: 18 }, (_, i) => weekBoundaryIso(2024, i + 1)!);
    for (let i = 1; i < weeks.length; i++) expect(weeks[i] > weeks[i - 1]).toBe(true);
  });

  it('refuses to invent timing from a missing or nonsensical season/week', () => {
    expect(weekBoundaryIso(null, 1)).toBeNull();
    expect(weekBoundaryIso(2024, null)).toBeNull();
    expect(weekBoundaryIso(2024, 0)).toBeNull();
    expect(weekBoundaryIso(2024, 99)).toBeNull();
    expect(weekBoundaryIso(2024.5, 1)).toBeNull();
    expect(derivedGameId(null, 1, 'BUF')).toBeNull();
    expect(derivedGameId(2024, null, 'BUF')).toBeNull();
    expect(derivedGameId(2024, 1, '')).toBeNull();
  });

  it('as-of clamping still excludes games after the as-of instant', () => {
    const { snapshot, byName } = board();
    const josh = byName('josh allen')!;
    // As-of before the 2024 opener: no game qualifies, so no counting fact is produced.
    const early = buildNormalizedInferenceInput(snapshot, {
      canonicalId: josh.canonicalId!, position: 'QB', asOf: '2024-08-01T00:00:00.000Z', engineVersion: 'qb-mvp-1.0',
    })!;
    expect(early.facts.career_pass_attempts).toBeUndefined();
    const res = runInference(early);
    expect(res.readinessStatus).toBe('NOT_READY');
    expect(res.engineInvoked).toBe(false);
  });
});
