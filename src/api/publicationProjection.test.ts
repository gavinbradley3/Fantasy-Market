// Tests for the published-player projection (Phase 10 API widening).
//
// The contract under test is narrow and absolute: read what the artifacts published, invent
// nothing. Every case below is either "this field was published, it comes through unchanged"
// or "this field was not published, the result is null".

import { describe, expect, it } from 'vitest';
import { projectPublishedPlayer } from './publicationProjection';

/** A canonical-player field as the ingestion layer serializes it (provenance-wrapped). */
const present = (value: unknown) => ({ present: true, provenance: 'DIRECT', provider: 'nflverse', value });
const absent = { present: false, reason: 'NOT_PROVIDED' };

function normalizedInput(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    asOf: '2025-10-01T00:00:00.000Z',
    engineVersion: 'wr-mvp-1.0',
    player: {
      identity: { canonical_id: 'pt-1' },
      position: 'WR',
      full_name: present('test receiver'),
      team: present('CIN'),
      age: present(26),
      status: present('active'),
      birth_date: absent,
      ...over,
    },
  });
}

function envelope(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    player_id: 'pt-1',
    position: 'WR',
    as_of: '2025-10-01T00:00:00.000Z',
    status: 'OK',
    readiness: 'READY',
    readiness_missing: [],
    honesty_state: 'COMPLETE',
    engine_invoked: true,
    public_confidence_label: 'HIGH',
    limitations: ['UNVALIDATED_MODEL'],
    engine_output: {
      player_name: 'Test Receiver',
      team: 'CIN',
      composites: { WEEKLY: 71.5, ROS: 68.2, ONE_YEAR: 66, THREE_YEAR: 61.4, DYNASTY: 59 },
      confidence: { score: 82, label: 'HIGH' },
      volatility: { score: 31, label: 'LOW' },
    },
    ...over,
  });
}

describe('projectPublishedPlayer', () => {
  it('projects a fully-valued entry from the engine output', () => {
    const p = projectPublishedPlayer(normalizedInput(), envelope());
    expect(p.name).toBe('Test Receiver');
    expect(p.team).toBe('CIN');
    expect(p.age).toBe(26);
    expect(p.playerStatus).toBe('active');
    expect(p.readiness).toBe('READY');
    expect(p.honestyState).toBe('COMPLETE');
    expect(p.engineInvoked).toBe(true);
    expect(p.publicConfidenceLabel).toBe('HIGH');
    expect(p.confidenceScore).toBe(82);
    expect(p.confidenceLabel).toBe('HIGH');
    expect(p.volatilityScore).toBe(31);
    expect(p.volatilityLabel).toBe('LOW');
    expect(p.composites).toEqual({ weekly: 71.5, ros: 68.2, oneYear: 66, threeYear: 61.4, dynasty: 59 });
    expect(p.limitations).toEqual(['UNVALIDATED_MODEL']);
  });

  it('reads QB composites and identity from their nested/lower-case spelling', () => {
    const qb = envelope({
      position: 'QB',
      engine_output: {
        player: { player_id: 'pt-2', player_name: 'Test Passer', team: 'CIN' },
        composites: { weekly: 64, ros: 62, one_year: 60, three_year: 58, dynasty: 55 },
        confidence: { score: 70, label: 'MEDIUM' },
        volatility: { score: 44, label: 'MEDIUM' },
      },
    });
    const p = projectPublishedPlayer(normalizedInput(), qb);
    expect(p.name).toBe('Test Passer');
    expect(p.team).toBe('CIN');
    expect(p.composites).toEqual({ weekly: 64, ros: 62, oneYear: 60, threeYear: 58, dynasty: 55 });
    expect(p.confidenceLabel).toBe('MEDIUM');
  });

  it('publishes NO valuation when the inference layer published none', () => {
    // This is the real state of a NOT_READY publication today: identity is published, the
    // valuation is not. Nothing may be substituted for the missing numbers.
    const notReady = envelope({
      status: 'UNAVAILABLE',
      readiness: 'NOT_READY',
      readiness_missing: ['target_share', 'route_participation_last4'],
      honesty_state: 'UNAVAILABLE',
      engine_invoked: false,
      public_confidence_label: null,
      engine_output: null,
    });
    const p = projectPublishedPlayer(normalizedInput(), notReady);
    expect(p.composites).toBeNull();
    expect(p.confidenceScore).toBeNull();
    expect(p.confidenceLabel).toBeNull();
    expect(p.volatilityScore).toBeNull();
    expect(p.publicConfidenceLabel).toBeNull();
    expect(p.engineInvoked).toBe(false);
    expect(p.readiness).toBe('NOT_READY');
    expect(p.readinessMissingCount).toBe(2);
    // Identity still comes through — from the normalized input artifact.
    expect(p.name).toBe('test receiver');
    expect(p.team).toBe('CIN');
  });

  it('falls back to the canonical record for identity the engine did not publish', () => {
    const noIdentity = envelope({ engine_output: { composites: { WEEKLY: 10 } } });
    const p = projectPublishedPlayer(normalizedInput(), noIdentity);
    expect(p.name).toBe('test receiver');
    expect(p.team).toBe('CIN');
  });

  it('projects null for canonical fields the ingestion layer marked absent', () => {
    const p = projectPublishedPlayer(
      normalizedInput({ full_name: absent, team: absent, age: absent, status: absent }),
      envelope({ engine_output: null }),
    );
    expect(p.name).toBeNull();
    expect(p.team).toBeNull();
    expect(p.age).toBeNull();
    expect(p.playerStatus).toBeNull();
  });

  it('drops non-finite numbers rather than passing NaN through', () => {
    // JSON cannot carry NaN, but a hand-rolled or future producer could send a string.
    const weird = envelope({
      engine_output: {
        player_name: 'X',
        composites: { WEEKLY: 'high', ROS: 5 },
        confidence: { score: null, label: 'HIGH' },
      },
    });
    const p = projectPublishedPlayer(normalizedInput(), weird);
    expect(p.composites).toEqual({ weekly: null, ros: 5, oneYear: null, threeYear: null, dynasty: null });
    expect(p.confidenceScore).toBeNull();
    expect(p.confidenceLabel).toBe('HIGH');
  });

  // The production envelope ALWAYS carries `published_confidence_score`, so a fixture that
  // omits it cannot detect the score being re-pointed away from the engine. These two cases
  // pin the source of the published score for each tier.
  it('FULL tier publishes the engine confidence, not the AIL public confidence', () => {
    const withPublished = envelope({
      model_tier: 'FULL',
      // The AIL's public confidence is a DIFFERENT quantity from the engine's confidence.
      // Reading it here would move every QB/WR score while leaving the label behind.
      published_confidence_score: 13,
      public_confidence_label: 'LOW',
    });
    const p = projectPublishedPlayer(normalizedInput(), withPublished);
    expect(p.confidenceScore).toBe(82);
    expect(p.confidenceLabel).toBe('HIGH');
  });

  it('score and label always come from the same source (they render in one cell)', () => {
    // ACCESSIBLE tier: no engine output, so both fall through to the accessible model.
    const accessible = JSON.stringify({
      player_id: 'pt-2',
      position: 'RB',
      as_of: '2025-10-01T00:00:00.000Z',
      status: 'OK',
      readiness: 'NOT_READY',
      readiness_missing: ['career_routes'],
      honesty_state: 'UNAVAILABLE',
      engine_invoked: false,
      model_tier: 'ACCESSIBLE',
      published_confidence_score: 53,
      public_confidence_label: 'LOW',
      engine_output: null,
      accessible_model: {
        modelVersion: 'rb-accessible-1.0',
        positionValue: 71.2,
        role: 'Lead rusher',
        composites: { weekly: 70, ros: 71, oneYear: 72, threeYear: 71, dynasty: 70 },
        confidence: { score: 53, label: 'MEDIUM', penaltyCodes: [] },
      },
    });
    const p = projectPublishedPlayer(normalizedInput({ position: 'RB' }), accessible);
    expect(p.modelTier).toBe('ACCESSIBLE');
    expect(p.confidenceScore).toBe(53);
    expect(p.confidenceLabel).toBe('MEDIUM');
    // The pairing is what matters: a MEDIUM label must never sit beside a score the label
    // could not have been derived from.
    expect(p.confidenceScore).toBeLessThan(75);
  });

  it('is total: unparseable or missing artifacts project to nulls instead of throwing', () => {
    expect(() => projectPublishedPlayer(undefined, undefined)).not.toThrow();
    const p = projectPublishedPlayer('{not json', 'also not json');
    expect(p.name).toBeNull();
    expect(p.composites).toBeNull();
    expect(p.engineInvoked).toBe(false);
    expect(p.limitations).toEqual([]);
  });
});

describe('the published tier decides which model’s numbers are published', () => {
  it('publishes the ACCESSIBLE model’s numbers when the tier says ACCESSIBLE, even though a frozen engine output is present', () => {
    // A WR stood down for want of real route evidence carries BOTH outputs. Reading by presence
    // would publish the premium engine's composites and confidence under an ACCESSIBLE badge.
    const p = projectPublishedPlayer(
      normalizedInput(),
      envelope({
        model_tier: 'ACCESSIBLE',
        accessible_model: {
          modelVersion: 'wr-accessible-1.0',
          composites: { weekly: 40, ros: 41, oneYear: 42, threeYear: 43, dynasty: 44 },
          positionValue: 42,
          role: 'Starting receiver',
          confidence: { score: 61, label: 'MEDIUM' },
        },
      }),
    );
    expect(p.modelTier).toBe('ACCESSIBLE');
    expect(p.modelVersion).toBe('wr-accessible-1.0');
    expect(p.composites?.dynasty).toBe(44);
    expect(p.confidenceScore).toBe(61);
    expect(p.confidenceLabel).toBe('MEDIUM');
    // Volatility is a frozen-engine output and is not borrowed by the accessible tier.
    expect(p.volatilityScore).toBeNull();
  });

  it('publishes NO value for an explicitly INSUFFICIENT player, whatever the frozen engine produced', () => {
    // Three never-targeted receivers hit exactly this case on the live board: INSUFFICIENT to
    // the receiving model, while the frozen engine still produced a dynasty composite from its
    // league constants — one of them 56.6, which would have outranked real starters.
    const p = projectPublishedPlayer(
      normalizedInput(),
      envelope({
        model_tier: 'INSUFFICIENT',
        accessible_insufficient: { reasonCode: 'NO_RECEIVING_OPPORTUNITY', reason: 'never targeted' },
      }),
    );
    expect(p.modelTier).toBe('INSUFFICIENT');
    expect(p.composites).toBeNull();
    expect(p.insufficientReason).toBe('never targeted');
  });

  it('still reads an envelope written before the tier field existed, by presence', () => {
    // An absent tier badges INSUFFICIENT (the safe direction) but must not blank an older
    // board's composites, which is a different failure from closing the leak above.
    const p = projectPublishedPlayer(normalizedInput(), envelope());
    expect(p.composites?.dynasty).toBe(59);
  });
});
