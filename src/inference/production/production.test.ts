import { describe, expect, it } from 'vitest';
// These tests drive the finalize path (emit → merge → readiness → engine → serialize)
// with COMPLETE observed facts, so they use the test-only precomputed-fields entry
// `runInferenceFromFields`. The end-to-end production path (Phase 2A/2B from normalized
// input) is covered in `e2e.test.ts` (Cold-audit M1). The old `.checksum` is now
// `.outputChecksum` (Cold-audit M2: the normalized-input checksum is separate).
import { runInferenceFromFields } from '@/inference/production/runInference';
import { ProductionValidationError, type PrecomputedFieldsInput } from '@/inference/production/types';
import { emitSupplement } from '@/inference/production/emit';
import { declarationOrder } from '@/inference/production/serialize';
import { present, notProvided } from '@/pipeline/provenance';
import type { CanonicalPlayer, SupportedPosition } from '@/pipeline/types';
import { readFixture } from '@/pipeline/test-support';
import { METADATA_KEYS } from '@/inference/production/fieldKinds';
import { assessWRReadiness, assessQBReadiness } from '@/pipeline/readiness/engineReadiness';
import { evaluateWideReceiver } from '@/wr-model';
import { evaluateQuarterback } from '@/qb-model';
import rbInput from '@/rb-model/fixtures/rb/explosive-rookie.json';
import { makeField, type IntermediateField } from '@/inference/result/types';

const T = '2026-07-01T00:00:00.000Z';

function player(position: SupportedPosition, overrides: Partial<CanonicalPlayer> = {}): CanonicalPlayer {
  return {
    identity: { canonical_id: 'pt_test', provider_ids: { sleeper: '1' }, name_normalized: 'test player', newly_created: false },
    position,
    full_name: present('Test Player', 'sleeper', T),
    team: present('CIN', 'sleeper', T),
    age: present(25, 'sleeper', T),
    birth_date: notProvided(),
    nfl_seasons_completed: present(4, 'sleeper', T),
    rookie_year: notProvided(),
    draft_year: notProvided(),
    draft_round: present(1, 'nflverse', T),
    draft_pick: notProvided(),
    height_inches: notProvided(),
    weight_pounds: notProvided(),
    jersey_number: notProvided(),
    status: present('active', 'sleeper', T),
    injury_designation: notProvided(),
    headshot_url: notProvided(),
    provenance: { sources: ['sleeper'], generated_at: T },
    ...overrides,
  };
}

const wrSupplement = () => (readFixture('metrics.sample.json') as { wr: Record<string, Record<string, unknown>> }).wr.pt_0001;
const qbSupplement = () => (readFixture('metrics.sample.json') as { qb: Record<string, Record<string, unknown>> }).qb.pt_0002;

/** Split a complete engine-input fixture into a facts supplement (non-metadata keys). */
function factsFromInput(position: SupportedPosition, input: Record<string, unknown>): Record<string, unknown> {
  const meta = new Set([...METADATA_KEYS[position], 'scoring']);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (!meta.has(k)) out[k] = v;
  return out;
}

function baseInput(position: SupportedPosition, facts: Record<string, unknown>, inferenceFields: IntermediateField<unknown>[] = []): PrecomputedFieldsInput {
  return {
    player: player(position),
    asOf: T,
    facts,
    inferenceFields,
    freshnessBySource: { nflverse_weekly: 1, snaps: 1, participation: 1, pbp: 1, schedule: 1, injury: 1, official_starts: 1 },
    snapshotIds: ['s1'],
    engineVersion: 'wr-mvp-1.0',
  };
}

describe('Phase 3 production runInference', () => {
  it('WR baseline equivalence: facts-complete player → engine output matches direct evaluation, no AIL overwrite', () => {
    const facts = wrSupplement();
    const res = runInferenceFromFields(baseInput('WR', facts));
    expect(res.readinessStatus).toBe('READY');
    expect(res.engineInvoked).toBe(true);
    // observed facts preserved (AIL added nothing).
    for (const k of Object.keys(facts)) expect(res.mergedSupplement[k]).toEqual(facts[k]);
    // identical to the existing pre-AIL path.
    const direct = assessWRReadiness(player('WR'), facts as never, T);
    if (direct.status !== 'READY') throw new Error('fixture not ready');
    expect(res.engineOutput).toEqual(evaluateWideReceiver(direct.input));
  });

  it('QB baseline equivalence via the real engine (deterministic generated_at)', () => {
    const facts = qbSupplement();
    const res = runInferenceFromFields(baseInput('QB', facts));
    expect(res.engineInvoked).toBe(true);
    const direct = assessQBReadiness(player('QB'), facts as never, T);
    if (direct.status !== 'READY') throw new Error('fixture not ready');
    expect(res.engineOutput).toEqual(evaluateQuarterback(direct.input, { generated_at: T }));
  });

  it('RB baseline equivalence from a complete engine-input fixture', () => {
    const facts = factsFromInput('RB', rbInput as Record<string, unknown>);
    const res = runInferenceFromFields(baseInput('RB', facts));
    expect(res.readinessStatus).toBe('READY');
    expect(res.engineInvoked).toBe(true);
    for (const k of Object.keys(facts)) expect(res.mergedSupplement[k]).toEqual(facts[k]);
  });

  it('facts override AIL estimates for a dual-owned field; AIL fills a missing field', () => {
    const facts = wrSupplement();
    const observedTs = facts.target_share;
    const inference = [makeField({ field: 'target_share', value: 0.99, status: 'AVAILABLE' as const, provenance: 'MODEL_ESTIMATE' as const, confidence: 640, modelId: 'm', asOf: T })];
    const res = runInferenceFromFields(baseInput('WR', facts, inference));
    expect(res.mergedSupplement.target_share).toBe(observedTs); // fact wins over the 0.99 estimate
  });

  it('NOT_READY player produces a full honesty result without an engine valuation', () => {
    const res = runInferenceFromFields(baseInput('WR', {})); // no facts, no inference → missing required fields
    expect(res.readinessStatus).toBe('NOT_READY');
    expect(res.engineInvoked).toBe(false);
    expect(res.engineOutput).toBeNull();
    expect(res.honestyState).toBe('UNAVAILABLE');
    expect(res.readinessMissing.length).toBeGreaterThan(0);
  });

  it('serialization is byte-identical across shuffled fact construction order', () => {
    const facts = wrSupplement();
    const shuffled = Object.fromEntries(Object.entries(facts).reverse());
    const a = runInferenceFromFields(baseInput('WR', facts));
    const b = runInferenceFromFields(baseInput('WR', shuffled));
    expect(a.serialized).toBe(b.serialized);
    expect(a.outputChecksum).toBe(b.outputChecksum);
  });

  it('replay from identical inputs is fully identical', () => {
    const facts = wrSupplement();
    const a = runInferenceFromFields(baseInput('WR', facts));
    const b = runInferenceFromFields(baseInput('WR', facts));
    expect(a.serialized).toBe(b.serialized);
    expect(a.outputChecksum).toBe(b.outputChecksum);
    expect(a.engineOutput).toEqual(b.engineOutput);
    expect(a.reproducibility).toEqual(b.reproducibility);
  });

  it('serialized fields follow engine-interface declaration order (supplement only, no metadata)', () => {
    const res = runInferenceFromFields(baseInput('WR', wrSupplement()));
    const parsed = JSON.parse(res.serialized) as { fields: { field: string }[] };
    const order = declarationOrder('WR');
    const positions = parsed.fields.map((f) => order.indexOf(f.field));
    // strictly increasing → declaration order; and no metadata key present.
    for (let i = 1; i < positions.length; i++) expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    for (const f of parsed.fields) expect(METADATA_KEYS.WR).not.toContain(f.field);
  });

  it('validation failures throw typed errors (not swallowed)', () => {
    expect(() => runInferenceFromFields({ ...baseInput('WR', {}), asOf: 'not-a-date' })).toThrow(ProductionValidationError);
    const noId = player('WR', { identity: { canonical_id: '', provider_ids: {}, name_normalized: '', newly_created: false } });
    expect(() => runInferenceFromFields({ ...baseInput('WR', {}), player: noId })).toThrow(ProductionValidationError);
  });

  it('engine-confidence multiplication yields a public confidence label when READY', () => {
    const res = runInferenceFromFields({ ...baseInput('WR', wrSupplement()), engineVersion: 'wr-mvp-1.0' });
    expect(res.engineConfidence01).not.toBeNull();
    expect(res.publicConfidence.publicConfidence).not.toBeNull();
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(res.publicConfidenceLabel);
  });

  it('emitSupplement never emits metadata (engine adapts to AIL, not vice-versa)', () => {
    const r = emitSupplement('WR', []);
    expect(Object.keys(r.supplement)).toHaveLength(0);
  });
});
