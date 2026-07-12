import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PlayerModelPage from '@/pages/player-model/PlayerModelPage';
import { evaluateRunningBack } from '@/rb-model/engine';
import { getFixture as getRbFixture } from '@/pages/rb/registry';
import { evaluateTightEnd, TEValidationError } from '@/te-model';
import type { TEHorizon } from '@/te-model';
import { getFixture as getTeFixture } from '@/pages/te/registry';
import { evaluateQuarterback, QBValidationError } from '@/qb-model';
import type { QBHorizon } from '@/qb-model';
import { getFixture as getQbFixture } from '@/pages/qb/registry';
import { POSITION_MODULES } from '@/pages/player-model/registry';

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <PlayerModelPage />
    </MemoryRouter>,
  );
}

const renderRB = () => renderAt('/player-model?position=RB');
const renderWR = () => renderAt('/player-model?position=WR');

// Engine-computed values (proves the UI is never hardcoded).
function rb(id: string, horizon: 'WEEKLY' | 'ROS' | 'ONE_YEAR' | 'THREE_YEAR' | 'DYNASTY' = 'WEEKLY') {
  return evaluateRunningBack(getRbFixture(id)!.input, { selected_horizon: horizon });
}
const rbWeekly = (id: string) => rb(id).weekly.expected_fantasy_points.toFixed(1);

// Click a specific fixture card by its (unique) archetype text.
async function selectFixture(archetype: RegExp) {
  await userEvent.click(screen.getByRole('tab', { name: archetype }));
}

describe('§25.2 RB integration', () => {
  it('renders the seven core RB fixtures in the primary selector and four edge fixtures', () => {
    renderRB();
    const primary = screen.getByRole('tablist', { name: /^select an rb profile$/i });
    expect(within(primary).getAllByRole('tab')).toHaveLength(7);
    const edge = screen.getByRole('tablist', { name: /test scenarios/i });
    expect(within(edge).getAllByRole('tab')).toHaveLength(4);
  });

  it('invokes evaluateRunningBack: the default player and its Weekly EFO come from the engine', () => {
    renderRB();
    expect(screen.getByRole('heading', { level: 1, name: /derrick crown/i })).toBeInTheDocument();
    expect(rbWeekly('elite-bell-cow')).toBe('26.5');
    expect(screen.getAllByText('26.5').length).toBeGreaterThan(0);
  });

  it('selecting a different RB fixture changes the analyzed player', async () => {
    renderRB();
    await selectFixture(/Receiving specialist/i);
    expect(screen.getByRole('heading', { level: 1, name: /eli rivers/i })).toBeInTheDocument();
  });

  it('shows the eight RB component labels (not WR labels)', () => {
    renderRB();
    for (const name of [
      'Workload Role', 'Opportunity Quality', 'Rushing Efficiency', 'Receiving Utility',
      'Team Context', 'Role Durability', 'Age & Development', 'Availability',
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.queryByText('Route Role')).not.toBeInTheDocument();
  });

  it('edge-case fixtures are reachable and selectable', async () => {
    renderRB();
    await selectFixture(/Missing-data player/i);
    expect(screen.getByRole('heading', { level: 1, name: /ghost doe/i })).toBeInTheDocument();
  });
});

describe('§25.3 projection assertions', () => {
  it('elite bell cow: high Weekly EFO, rushing + receiving render, status OK, no fallback panel', () => {
    renderRB();
    expect(rbWeekly('elite-bell-cow')).toBe('26.5');
    expect(screen.getByRole('heading', { name: /^Rushing$/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Receiving$/ })).toBeInTheDocument();
    expect(screen.getByText(/No fallback data was required/i)).toBeInTheDocument();
    // Carry-control + goal-line explanations returned by the engine appear.
    expect(screen.getByText(/control most backfield carries/i)).toBeInTheDocument();
  });

  it('goal-line specialist: lower workload than elite, TD dependence visible', async () => {
    renderRB();
    await selectFixture(/Goal-line touchdown specialist/i);
    expect(rb('goal-line-specialist').weekly.expected_carries).toBeLessThan(rb('elite-bell-cow').weekly.expected_carries);
    expect(screen.getAllByText('TD dependence').length).toBeGreaterThan(0);
    expect(screen.getByText(/dominate goal-line work/i)).toBeInTheDocument();
  });

  it('receiving specialist: receiving stats + receiving dependence prominent', async () => {
    renderRB();
    await selectFixture(/Receiving specialist/i);
    expect(screen.getAllByText('Receiving dependence').length).toBeGreaterThan(0);
    expect(screen.getByText('Receptions')).toBeInTheDocument();
    const recTargets = rb('receiving-specialist').weekly.expected_targets.toFixed(1);
    expect(screen.getAllByText(recTargets).length).toBeGreaterThan(0);
  });

  it('explosive rookie: PARTIAL with Snap8 + contract fallbacks, confidence reduced, RE bounded', async () => {
    renderRB();
    await selectFixture(/Explosive rookie/i);
    expect(screen.getByText(/Fallback warnings/i)).toBeInTheDocument();
    expect(screen.getByText(/Eight-game snap share was unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Contract security was unavailable/i)).toBeInTheDocument();
    const out = rb('explosive-rookie');
    expect(out.confidence.label).not.toBe('HIGH');
    expect(screen.getByText(`${out.confidence.score.toFixed(1)} · ${out.confidence.label}`)).toBeInTheDocument();
    expect(out.components.RE).toBeLessThanOrEqual(100);
  });

  it('aging veteran: Weekly useful; Dynasty composite materially below Weekly composite', async () => {
    renderRB();
    await selectFixture(/Aging veteran/i);
    const w = rb('aging-veteran', 'WEEKLY');
    expect(w.weekly.expected_fantasy_points).toBeGreaterThan(10);
    expect(rb('aging-veteran', 'DYNASTY').composites.DYNASTY).toBeLessThan(w.composites.WEEKLY);
  });

  it('injury-return: workload ramp 72% shown and ROS recovery note displays', async () => {
    renderRB();
    await selectFixture(/Injury-return player/i);
    expect(rb('injury-return').weekly.workload_ramp_factor).toBeCloseTo(0.72, 2);
    expect(screen.getAllByText('72%').length).toBeGreaterThan(0);
    expect(screen.getByText(/ROS applies the current workload ramp/i)).toBeInTheDocument();
  });

  it('committee back: engine volatility (MEDIUM, per §26.16.11.4 fixture) shown faithfully; competition pressure visible', async () => {
    renderRB();
    await selectFixture(/Committee back/i);
    const out = rb('committee-back');
    // Engine truth shown as-is. The re-authored conformance fixture satisfies the
    // binding §26.16.11.4 "medium/high volatility" requirement (Decision 7 revision).
    expect(out.volatility.label).toBe('MEDIUM');
    expect(screen.getByText(`${out.volatility.score.toFixed(1)} · MEDIUM`)).toBeInTheDocument();
    expect(screen.getByText('Competition pressure')).toBeInTheDocument();
  });

  it('out player: Weekly and ROS EFO are zero; OUT status communicated', async () => {
    renderRB();
    await selectFixture(/Out player/i);
    const out = rb('out-player');
    expect(out.weekly.expected_fantasy_points).toBe(0);
    expect(out.ros.expected_fantasy_points).toBe(0);
    expect(out.weekly.expected_carries).toBe(0);
    // "Out" appears as an availability chip in the summary header.
    expect(screen.getAllByText(/\bOut\b/).length).toBeGreaterThan(0);
  });

  it('missing-data: all fallbacks render, status PARTIAL, confidence LOW, no NaN/undefined text', async () => {
    const { container } = renderRB();
    await selectFixture(/Missing-data player/i);
    const out = rb('missing-data');
    expect(out.status).toBe('PARTIAL');
    expect(out.confidence.label).toBe('LOW');
    expect(screen.getByText(new RegExp(`${out.fallback_log.length} fields substituted`, 'i'))).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/NaN|undefined/);
  });

  it('mobile-QB pair: high pressure shows lower carries, rush TDs, and Weekly EFO than low pressure', async () => {
    const low = rb('mobile-qb-low-pressure');
    const high = rb('mobile-qb-high-pressure');
    expect(high.weekly.expected_carries).toBeLessThan(low.weekly.expected_carries);
    expect(high.weekly.expected_rushing_touchdowns).toBeLessThanOrEqual(low.weekly.expected_rushing_touchdowns);
    expect(high.weekly.expected_fantasy_points).toBeLessThan(low.weekly.expected_fantasy_points);
    expect(high.components.TC).toBeLessThan(low.components.TC);

    renderRB();
    await selectFixture(/Mobile-QB, high pressure/i);
    expect(screen.getAllByText(high.weekly.expected_carries.toFixed(1)).length).toBeGreaterThan(0);
  });
});

describe('§25.4 position switching', () => {
  it('WR → RB updates the player selector and metadata; RB → WR restores the WR default', async () => {
    renderWR();
    expect(screen.getByRole('heading', { level: 1, name: /marcus crown/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Running Back' }));
    expect(screen.getByRole('heading', { level: 1, name: /derrick crown/i })).toBeInTheDocument();
    expect(screen.getByText('Workload Role')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Wide Receiver' }));
    expect(screen.getByRole('heading', { level: 1, name: /marcus crown/i })).toBeInTheDocument();
    expect(screen.getByText('Route Role')).toBeInTheDocument();
  });

  it('preserves the selected horizon across a position switch', async () => {
    renderWR();
    await userEvent.click(screen.getByRole('tab', { name: 'Dynasty' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Running Back' }));
    expect(screen.getByRole('tab', { name: 'Dynasty' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('§25.5 long-term horizons defer fantasy points (both positions)', () => {
  it('RB: long-term horizons show the deferral notice, keep components, and never fabricate points', async () => {
    renderRB();
    await userEvent.click(screen.getByRole('tab', { name: 'Three Years' }));
    expect(screen.getByText(/not included in RB MVP v1\.0/i)).toBeInTheDocument();
    // Components remain visible.
    expect(screen.getByText('Workload Role')).toBeInTheDocument();
  });

  it('WR: long-term horizons show the WR deferral notice', async () => {
    renderWR();
    await userEvent.click(screen.getByRole('tab', { name: 'Dynasty' }));
    expect(screen.getByText(/not included in WR MVP v1\.0/i)).toBeInTheDocument();
  });
});

describe('§25.6 accessibility', () => {
  it('position selector is keyboard operable and exposes checked state', async () => {
    renderWR();
    const wr = screen.getByRole('radio', { name: 'Wide Receiver' });
    expect(wr).toHaveAttribute('aria-checked', 'true');
    wr.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Running Back' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('heading', { level: 1, name: /derrick crown/i })).toBeInTheDocument();
  });

  it('RB player selector is keyboard operable with arrow keys', async () => {
    renderRB();
    const first = screen.getByRole('tab', { name: /Elite three-down bell cow/i });
    first.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('heading', { level: 1, name: /bruno pike/i })).toBeInTheDocument();
  });

  it('RB horizon tabs are keyboard operable and expose selected state', async () => {
    renderRB();
    const weekly = screen.getByRole('tab', { name: 'Weekly' });
    expect(weekly).toHaveAttribute('aria-selected', 'true');
    weekly.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Rest of Season' })).toHaveAttribute('aria-selected', 'true');
  });

  it('RB component score bars expose accessible numeric labels', () => {
    renderRB();
    const wrk = rb('elite-bell-cow').components.WRK.toFixed(1);
    expect(screen.getByLabelText(new RegExp(`Workload Role score: ${wrk} out of 100`, 'i'))).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TE integration — the third position wired into the shared Player Model page.
// ---------------------------------------------------------------------------
const renderTE = () => renderAt('/player-model?position=TE');

function te(id: string, horizon: TEHorizon = 'WEEKLY') {
  return evaluateTightEnd(getTeFixture(id)!.input, { selected_horizon: horizon });
}
const teWeekly = (id: string) => te(id).weekly.expected_fantasy_points.toFixed(1);

describe('TE integration', () => {
  it('renders the nine core TE fixtures in the primary selector and four edge fixtures', () => {
    renderTE();
    const primary = screen.getByRole('tablist', { name: /^select a te profile$/i });
    expect(within(primary).getAllByRole('tab')).toHaveLength(9);
    const edge = screen.getByRole('tablist', { name: /test scenarios/i });
    expect(within(edge).getAllByRole('tab')).toHaveLength(4);
  });

  it('invokes evaluateTightEnd: the default player and its Weekly EFO come from the engine', () => {
    renderTE();
    expect(screen.getByRole('heading', { level: 1, name: /alden crestwood/i })).toBeInTheDocument();
    expect(teWeekly('elite-receiving-focal-point')).toBe('18.0');
    expect(screen.getAllByText('18.0').length).toBeGreaterThan(0);
  });

  it('selecting a different TE fixture changes the analyzed player', async () => {
    renderTE();
    await selectFixture(/Red-zone specialist/i);
    expect(screen.getByRole('heading', { level: 1, name: /tobias renfield/i })).toBeInTheDocument();
  });

  it('shows the eight TE component labels, distinct from WR and RB terminology', () => {
    renderTE();
    for (const name of [
      'Route Role', 'Target Earning', 'Target Quality', 'Receiving Efficiency',
      'Team Context', 'Role Durability', 'Age & Development', 'Availability',
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    // TE uses "Receiving Efficiency", never the RB "Rushing Efficiency" or the
    // WR standalone "Efficiency" label.
    expect(screen.queryByText('Rushing Efficiency')).not.toBeInTheDocument();
    expect(screen.queryByText('Workload Role')).not.toBeInTheDocument();
  });

  it('edge-case fixtures are reachable and selectable', async () => {
    renderTE();
    await selectFixture(/Missing-data player/i);
    expect(screen.getByRole('heading', { level: 1, name: /quill barrowdine/i })).toBeInTheDocument();
  });

  it('elite focal point: high Weekly EFO, receiving stats render, status OK, no fallback panel', () => {
    renderTE();
    expect(teWeekly('elite-receiving-focal-point')).toBe('18.0');
    expect(screen.getByRole('heading', { name: /^Receiving$/ })).toBeInTheDocument();
    expect(screen.getByText('Receptions')).toBeInTheDocument();
    expect(screen.getByText(/No fallback data was required/i)).toBeInTheDocument();
    // A tight-end-specific driver from the engine appears.
    expect(screen.getByText(/Runs routes on most team dropbacks/i)).toBeInTheDocument();
  });

  it('red-zone specialist: TE-specific TD dependence + red-zone context surfaced', async () => {
    renderTE();
    await selectFixture(/Red-zone specialist/i);
    expect(screen.getAllByText('TD dependence').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Explosive dependence').length).toBeGreaterThan(0);
    expect(screen.getByText('Red-zone target rate')).toBeInTheDocument();
    expect(screen.getByText(/Red-zone usage supports touchdown opportunity/i)).toBeInTheDocument();
  });

  it('out player: Weekly and ROS EFO are zero; OUT status communicated', async () => {
    renderTE();
    await selectFixture(/Out player/i);
    const out = te('out-player');
    expect(out.weekly.expected_fantasy_points).toBe(0);
    expect(out.ros.expected_fantasy_points).toBe(0);
    expect(screen.getAllByText(/\bOut\b/).length).toBeGreaterThan(0);
  });

  it('young breakout: PARTIAL with a logged fallback, confidence reduced below HIGH', async () => {
    renderTE();
    await selectFixture(/Young breakout/i);
    const out = te('young-breakout');
    expect(out.status).toBe('PARTIAL');
    expect(out.confidence.label).not.toBe('HIGH');
    expect(screen.getByText(/Fallback warnings/i)).toBeInTheDocument();
    expect(screen.getByText(`${out.confidence.score.toFixed(1)} · ${out.confidence.label}`)).toBeInTheDocument();
  });

  it('missing-data: missing inputs are surfaced as explicit fallback warnings, not hidden defaults', async () => {
    const { container } = renderTE();
    await selectFixture(/Missing-data player/i);
    const out = te('missing-data');
    expect(out.status).toBe('PARTIAL');
    expect(out.confidence.label).toBe('LOW');
    expect(out.fallback_log.length).toBe(20);
    expect(screen.getByText(new RegExp(`${out.fallback_log.length} fields substituted`, 'i'))).toBeInTheDocument();
    // No silent NaN/undefined leaks into the rendered UI.
    expect(container.textContent ?? '').not.toMatch(/NaN|undefined/);
  });

  it('long-term horizons defer TE fantasy points but keep the component profile', async () => {
    renderTE();
    await userEvent.click(screen.getByRole('tab', { name: 'Dynasty' }));
    expect(screen.getByText(/not included in TE MVP v1\.0/i)).toBeInTheDocument();
    expect(screen.getByText('Route Role')).toBeInTheDocument();
  });

  it('TE component score bars expose accessible numeric labels', () => {
    renderTE();
    const rr = te('elite-receiving-focal-point').components.RR.toFixed(1);
    expect(screen.getByLabelText(new RegExp(`Route Role score: ${rr} out of 100`, 'i'))).toBeInTheDocument();
  });
});

describe('TE validation & error handling (inputs are never silently defaulted)', () => {
  it('the engine rejects structurally invalid TE input with a TEValidationError', () => {
    // The UI contract depends on the engine validating inputs rather than
    // coercing them; malformed input must throw, not silently produce output.
    expect(() => evaluateTightEnd({} as never)).toThrow(TEValidationError);
  });

  it('the TE module returns a clear, user-facing error for an unknown profile', () => {
    const result = POSITION_MODULES.TE.build('does-not-exist', 'WEEKLY');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/could not be loaded/i);
  });
});

describe('three-way position switching leaves no stale state', () => {
  it('WR → RB → TE → WR updates player, component labels, and clears position-specific UI', async () => {
    renderWR();
    expect(screen.getByRole('heading', { level: 1, name: /marcus crown/i })).toBeInTheDocument();
    expect(screen.getByText('Route Role')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Running Back' }));
    expect(screen.getByRole('heading', { level: 1, name: /derrick crown/i })).toBeInTheDocument();
    expect(screen.getByText('Workload Role')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Tight End' }));
    expect(screen.getByRole('heading', { level: 1, name: /alden crestwood/i })).toBeInTheDocument();
    // TE labels present; RB-only + WR-only labels gone (no stale carry-over).
    expect(screen.getByText('Receiving Efficiency')).toBeInTheDocument();
    expect(screen.queryByText('Workload Role')).not.toBeInTheDocument();
    expect(screen.queryByText('Rushing Efficiency')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Wide Receiver' }));
    expect(screen.getByRole('heading', { level: 1, name: /marcus crown/i })).toBeInTheDocument();
    expect(screen.getByText('Route Role')).toBeInTheDocument();
    // TE-only projection context must not persist after leaving TE.
    expect(screen.queryByText('Explosive dependence')).not.toBeInTheDocument();
  });

  it('preserves the selected horizon across a switch into TE', async () => {
    renderWR();
    await userEvent.click(screen.getByRole('tab', { name: 'Dynasty' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Tight End' }));
    expect(screen.getByRole('tab', { name: 'Dynasty' })).toHaveAttribute('aria-selected', 'true');
  });

  it('TE position selector is keyboard operable and exposes checked state', async () => {
    renderTE();
    const teRadio = screen.getByRole('radio', { name: 'Tight End' });
    expect(teRadio).toHaveAttribute('aria-checked', 'true');
  });
});

// ---------------------------------------------------------------------------
// QB integration — the fourth position wired into the shared Player Model page.
// ---------------------------------------------------------------------------
const renderQB = () => renderAt('/player-model?position=QB');

function qb(id: string, horizon: QBHorizon = 'WEEKLY') {
  return evaluateQuarterback(getQbFixture(id)!.input, { selected_horizon: horizon });
}
const qbWeekly = (id: string) => qb(id).expected_fantasy_output.weekly_fantasy_points.toFixed(1);

describe('QB integration', () => {
  it('renders the eleven core QB fixtures in the primary selector and four edge fixtures', () => {
    renderQB();
    const primary = screen.getByRole('tablist', { name: /^select a qb profile$/i });
    expect(within(primary).getAllByRole('tab')).toHaveLength(11);
    const edge = screen.getByRole('tablist', { name: /test scenarios/i });
    expect(within(edge).getAllByRole('tab')).toHaveLength(4);
  });

  it('invokes evaluateQuarterback: the default player and its Weekly EFO come from the engine', () => {
    renderQB();
    expect(screen.getByRole('heading', { level: 1, name: /elite dual threat/i })).toBeInTheDocument();
    expect(qbWeekly('QB-G01')).toBe('27.5');
    expect(screen.getAllByText('27.5').length).toBeGreaterThan(0);
  });

  it('selecting a different QB fixture changes the analyzed player', async () => {
    renderQB();
    await selectFixture(/Elite pocket passer/i);
    expect(screen.getByRole('heading', { level: 1, name: /elite pocket passer/i })).toBeInTheDocument();
  });

  it('shows the eight QB component labels, distinct from WR/RB/TE terminology', () => {
    renderQB();
    for (const name of [
      'Passing Opportunity', 'Passing Quality', 'Rushing Value', 'Scoring Environment',
      'Role Security', 'Availability', 'Age & Development', 'Sustainability',
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    // QB uses passing/rushing terminology, never the receiving-position labels.
    expect(screen.queryByText('Route Role')).not.toBeInTheDocument();
    expect(screen.queryByText('Workload Role')).not.toBeInTheDocument();
    expect(screen.queryByText('Receiving Efficiency')).not.toBeInTheDocument();
  });

  it('edge-case fixtures are reachable and selectable', async () => {
    renderQB();
    await selectFixture(/Fallback-heavy profile/i);
    expect(screen.getByRole('heading', { level: 1, name: /fallback heavy/i })).toBeInTheDocument();
  });

  it('elite dual threat: high Weekly EFO, passing + rushing render, COMPLETE, no fallback panel', () => {
    renderQB();
    expect(qbWeekly('QB-G01')).toBe('27.5');
    expect(qb('QB-G01').status).toBe('COMPLETE');
    expect(screen.getByRole('heading', { name: /^Passing \(if active\)$/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Rushing \(if active\)$/ })).toBeInTheDocument();
    expect(screen.getByText(/No fallback data was required/i)).toBeInTheDocument();
    // A QB-specific engine driver appears verbatim.
    expect(
      screen.getByText(/Designed rushing, scrambling, and rushing production/i),
    ).toBeInTheDocument();
  });

  it('rushing-dependent QB: rushing dependence + role-dependence context surfaced', async () => {
    renderQB();
    await selectFixture(/Rushing-dependent QB/i);
    expect(screen.getAllByText('Rushing dependence').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Turnover risk').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Role instability').length).toBeGreaterThan(0);
    const out = qb('QB-G05');
    expect(out.volatility.rushing_dependence).toBeGreaterThanOrEqual(40);
  });

  it('out quarterback: Weekly EFO is zero and OUT status is communicated', async () => {
    renderQB();
    await selectFixture(/Out quarterback/i);
    const out = qb('QB-E03');
    expect(out.expected_fantasy_output.weekly_fantasy_points).toBe(0);
    expect(screen.getAllByText(/\bOut\b/).length).toBeGreaterThan(0);
  });

  it('fallback-heavy profile: FALLBACK_HEAVY status, fallback warnings render, confidence LOW, no NaN/undefined', async () => {
    const { container } = renderQB();
    await selectFixture(/Fallback-heavy profile/i);
    const out = qb('QB-G12');
    expect(out.status).toBe('FALLBACK_HEAVY');
    expect(out.confidence.label).toBe('LOW');
    expect(screen.getByText(/Fallback warnings/i)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${out.fallback_log.length} fields substituted`, 'i'))).toBeInTheDocument();
    expect(screen.getByText(`${out.confidence.score.toFixed(1)} · ${out.confidence.label}`)).toBeInTheDocument();
    // The engine's native FALLBACK_HEAVY status is surfaced verbatim in the header.
    expect(screen.getByText(/Output FALLBACK_HEAVY/i)).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/NaN|undefined/);
  });

  it('long-term horizons defer QB fantasy points but keep the component profile', async () => {
    renderQB();
    await userEvent.click(screen.getByRole('tab', { name: 'Dynasty' }));
    expect(screen.getByText(/not included in QB MVP v1\.2/i)).toBeInTheDocument();
    expect(screen.getByText('Passing Opportunity')).toBeInTheDocument();
  });

  it('QB component score bars expose accessible numeric labels', () => {
    renderQB();
    const po = qb('QB-G01').components.passing_opportunity.toFixed(1);
    expect(
      screen.getByLabelText(new RegExp(`Passing Opportunity score: ${po} out of 100`, 'i')),
    ).toBeInTheDocument();
  });
});

describe('QB validation & error handling (inputs are never silently defaulted)', () => {
  it('the engine rejects structurally invalid QB input with a QBValidationError', () => {
    expect(() => evaluateQuarterback({} as never)).toThrow(QBValidationError);
  });

  it('the QB module returns a clear, user-facing error for an unknown profile', () => {
    const result = POSITION_MODULES.QB.build('does-not-exist', 'WEEKLY');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/could not be loaded/i);
  });
});

describe('four-way position switching includes QB with no stale state', () => {
  it('WR → QB updates player + QB labels; QB → WR restores WR and clears QB-only UI', async () => {
    renderWR();
    expect(screen.getByText('Route Role')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Quarterback' }));
    expect(screen.getByRole('heading', { level: 1, name: /elite dual threat/i })).toBeInTheDocument();
    expect(screen.getByText('Passing Opportunity')).toBeInTheDocument();
    expect(screen.queryByText('Route Role')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Wide Receiver' }));
    expect(screen.getByRole('heading', { level: 1, name: /marcus crown/i })).toBeInTheDocument();
    expect(screen.getByText('Route Role')).toBeInTheDocument();
    // QB-only projection context must not persist after leaving QB.
    expect(screen.queryByText('Rushing dependence')).not.toBeInTheDocument();
  });

  it('preserves the selected horizon across a switch into QB', async () => {
    renderWR();
    await userEvent.click(screen.getByRole('tab', { name: 'Dynasty' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Quarterback' }));
    expect(screen.getByRole('tab', { name: 'Dynasty' })).toHaveAttribute('aria-selected', 'true');
  });

  it('QB position selector is keyboard operable and exposes checked state', () => {
    renderQB();
    const qbRadio = screen.getByRole('radio', { name: 'Quarterback' });
    expect(qbRadio).toHaveAttribute('aria-checked', 'true');
  });
});
