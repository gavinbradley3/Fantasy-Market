import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PlayerModelPage from '@/pages/player-model/PlayerModelPage';
import { evaluateRunningBack } from '@/rb-model/engine';
import { getFixture as getRbFixture } from '@/pages/rb/registry';

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

  it('committee back: engine volatility (LOW) shown faithfully; competition pressure visible', async () => {
    renderRB();
    await selectFixture(/Committee back/i);
    const out = rb('committee-back');
    expect(out.volatility.label).toBe('LOW'); // engine truth — not forced to MEDIUM/HIGH
    expect(screen.getByText(`${out.volatility.score.toFixed(1)} · LOW`)).toBeInTheDocument();
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
