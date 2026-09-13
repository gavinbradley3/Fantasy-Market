// The honesty badge, tested directly.
//
// It reads the inference layer's verdict and decides whether to render it as a WARNING. The
// distinction it has to get right is the one the tier system exists for: a player a reduced
// model valued is not "unavailable", however incomplete the model that did NOT value him was.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HonestyBadge, CoverageBadge, PlayerTickerValue, playerTickerValue } from './publishedRows';
import type { PublishedPlayer } from '@/services/publication';

function player(over: Partial<PublishedPlayer> = {}): PublishedPlayer {
  return {
    dynastyContract: 'canonical',
    dynastyValue: 61,
    dynastySurplus: null,
    dynastyDepth: null,
    dynastyValueSource: null,
    leagueSchemaId: 'dynasty-superflex-12',
    productionCurveVersion: 'production-v1-2017-2025',
    playerId: 'pt-1',
    position: 'RB',
    name: 'Test Back',
    team: 'KC',
    age: 24,
    value: 55,
    composites: null,
    overallRank: 3,
    positionRank: 1,
    confidenceScore: 78,
    confidenceLabel: 'HIGH',
    publicConfidenceLabel: 'HIGH',
    volatilityScore: null,
    volatilityLabel: null,
    honestyState: 'ESTIMATED',
    readiness: 'NOT_READY',
    outputStatus: 'AVAILABLE',
    readinessMissingCount: 1,
    limitations: [],
    asOf: '2026-09-11T00:00:00.000Z',
    outputChecksum: 'c1',
    modelTier: 'ACCESSIBLE',
    modelVersion: 'rb-accessible-1.0',
    positionValue: 61,
    publishedPositionalRank: 1,
    role: 'Three-down lead back',
    explanation: null,
    positiveFactors: [],
    negativeFactors: [],
    materialMissingInputs: ['Route participation (no approved RB/TE method for converting it to career routes)'],
    inputsSubstituted: null,
    insufficientReason: null,
    provenance: null,
    ...over,
  } as PublishedPlayer;
}

describe('HonestyBadge', () => {
  it('does not treat an accessible valuation as unavailable because the FULL model was not ready', () => {
    const { container } = render(<HonestyBadge player={player()} />);
    expect(screen.getByText('ESTIMATED')).toBeInTheDocument();
    expect(container.querySelector('.text-warning')).toBeNull();
  });

  it('still warns for a player NO model valued', () => {
    const { container } = render(
      <HonestyBadge player={player({ modelTier: 'INSUFFICIENT', honestyState: 'UNAVAILABLE' })} />,
    );
    expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument();
    expect(container.querySelector('.text-warning')).not.toBeNull();
  });

  it('warns for an unvalued player whose envelope predates the honesty fix', () => {
    // Belt and braces: an INSUFFICIENT player whose stored state still says NOT_READY and
    // carries no honesty verdict falls back to the output status and still reads as a warning.
    const { container } = render(
      <HonestyBadge player={player({ modelTier: 'INSUFFICIENT', honestyState: null, outputStatus: 'UNAVAILABLE' })} />,
    );
    expect(container.querySelector('.text-warning')).not.toBeNull();
  });
});

describe('CoverageBadge', () => {
  it('names the input set in three plain words', () => {
    render(<CoverageBadge player={player({ modelTier: 'FULL' })} />);
    expect(screen.getByText('Full')).toBeInTheDocument();
  });

  it('does not use the warning treatment for Standard coverage — it is not a defect', () => {
    // Reduced coverage is a fact about our data, not a problem with the player, and it sits
    // beside a confidence column that now carries the judgement.
    const { container } = render(<CoverageBadge player={player()} />);
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(container.querySelector('.text-warning')).toBeNull();
  });

  it('says what Standard coverage did not include, in words rather than registry keys', () => {
    render(<CoverageBadge player={player()} />);
    expect(screen.getByTitle(/Route participation/)).toBeInTheDocument();
    expect(screen.queryByTitle(/career_routes/)).not.toBeInTheDocument();
  });

  it('marks a player no model could value as Limited', () => {
    render(<CoverageBadge player={player({ modelTier: 'INSUFFICIENT', insufficientReason: 'never targeted' })} />);
    expect(screen.getByText('Limited')).toBeInTheDocument();
    expect(screen.getByTitle('never targeted')).toBeInTheDocument();
  });
});

describe('PlayerTickerValue', () => {
  it('shows the shared cross-position value, never the position composite', () => {
    render(<PlayerTickerValue player={player({ dynastyValue: 61, value: 55 })} />);
    expect(screen.getByText('61.0')).toBeInTheDocument();
    expect(screen.queryByText('55.0')).not.toBeInTheDocument();
  });

  it('falls back to the composite for a board published before the shared value existed', () => {
    // The SAME fallback the ranking uses, so display and order cannot disagree.
    expect(playerTickerValue(player({ dynastyContract: 'legacy', dynastyValue: null, value: 55 }))).toBe(55);
    render(<PlayerTickerValue player={player({ dynastyContract: 'legacy', dynastyValue: null, value: 55 })} />);
    expect(screen.getByText('55.0')).toBeInTheDocument();
  });

  it('shows absence as absence when no model valued the player', () => {
    render(<PlayerTickerValue player={player({ dynastyValue: null, value: null })} />);
    expect(screen.getByLabelText('no value published for this player')).toBeInTheDocument();
  });

  it('names the units and the league format on hover', () => {
    render(<PlayerTickerValue player={player()} />);
    expect(
      screen.getByTitle(/Projected dynasty value over positional replacement, 0–100 · league format dynasty-superflex-12/),
    ).toBeInTheDocument();
  });
});

describe('CoverageBadge — a full model on a substituted input set', () => {
  it('marks a full-model valuation that ran on substituted inputs, and says how many', () => {
    // The QB case. The engine runs for every quarterback, so the tier is FULL — but on the live
    // board all 81 ran with 16 of the engine's declared inputs substituted. That used to reach
    // the user only as a 20-point confidence deduction applied to every one of them.
    render(<CoverageBadge player={player({ modelTier: 'FULL', inputsSubstituted: 16 })} />);
    expect(screen.getByText('Full*')).toBeInTheDocument();
    expect(screen.getByTitle(/16 of its declared inputs substituted/)).toBeInTheDocument();
    // And it says whose fact it is, so the reader does not read it as a knock on the player.
    expect(screen.getByTitle(/not about this player/)).toBeInTheDocument();
  });

  it('says plain "Full" when the model genuinely got everything it asked for', () => {
    render(<CoverageBadge player={player({ modelTier: 'FULL', inputsSubstituted: 0 })} />);
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.getByTitle(/complete set of declared inputs/)).toBeInTheDocument();
  });

  it('falls back to plain "Full" for a board published before the count existed', () => {
    render(<CoverageBadge player={player({ modelTier: 'FULL', inputsSubstituted: null })} />);
    expect(screen.getByText('Full')).toBeInTheDocument();
  });
});
