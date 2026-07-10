import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import WrModelPage from '@/pages/WrModelPage';
import { evaluateWideReceiver } from '@/wr-model/engine';
import { getFixture } from '@/pages/wr/registry';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/wr-model']}>
      <WrModelPage />
    </MemoryRouter>,
  );
}

// Model-computed Weekly EFO for a fixture (proves values are not hardcoded).
function weeklyEfo(id: string): string {
  return evaluateWideReceiver(getFixture(id)!.input, { selected_horizon: 'WEEKLY' }).weekly.expected_fantasy_points.toFixed(1);
}

beforeEach(() => {
  // The market app's status hook isn't mounted here (page rendered directly),
  // so no provider is needed.
});

describe('§14.1 data integration', () => {
  it('renders all five fixtures in the selector, each with a model Weekly EFO', () => {
    renderPage();
    const tablist = screen.getByRole('tablist', { name: /select a wr profile/i });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs).toHaveLength(5);
    for (const id of ['elite-full-time', 'low-route-high-tprr', 'round-one-rookie', 'declining-veteran', 'deep-threat-low-efficiency']) {
      // The engine value appears somewhere in that fixture's tab.
      const efo = weeklyEfo(id);
      expect(within(tablist).getAllByText(efo).length).toBeGreaterThan(0);
    }
  });

  it('the displayed Weekly EFO comes from evaluateWideReceiver (matches the engine, not a constant)', () => {
    renderPage();
    // Elite is selected by default; the projection card shows the engine value.
    expect(weeklyEfo('elite-full-time')).toBe('21.9');
    expect(screen.getAllByText('21.9').length).toBeGreaterThan(0);
  });

  it('selecting a different fixture changes the analyzed player', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: /marcus crown/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Tyson Vale/i }));
    expect(screen.getByRole('heading', { level: 1, name: /tyson vale/i })).toBeInTheDocument();
  });
});

describe('§14.2 projection assertions', () => {
  it('elite: Weekly 21.9, routes > 30, confidence HIGH, no fallback', () => {
    renderPage();
    expect(weeklyEfo('elite-full-time')).toBe('21.9');
    // Routes cell shows > 30.
    const routes = Number(evaluateWideReceiver(getFixture('elite-full-time')!.input).weekly.expected_routes);
    expect(routes).toBeGreaterThan(30);
    expect(screen.getByText('100.0 · HIGH')).toBeInTheDocument();
    expect(screen.getByText(/No fallback data was required/i)).toBeInTheDocument();
  });

  it('rookie: Weekly 6.2, PARTIAL fallbacks (RP8 + contract security), confidence not HIGH, AD strong', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /Tyson Vale/i }));
    expect(weeklyEfo('round-one-rookie')).toBe('6.2');
    // Fallback panel present with both fields.
    expect(screen.getByText(/Fallback warnings/i)).toBeInTheDocument();
    expect(screen.getByText(/last 8 games\) was unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Contract security was unavailable/i)).toBeInTheDocument();
    // Confidence MEDIUM (not HIGH).
    expect(screen.getByText('63.0 · MEDIUM')).toBeInTheDocument();
    // AD is a strong component (score 78 → its bar carries an accessible label).
    expect(screen.getByLabelText(/Age & Development score: 78\.0 out of 100/i)).toBeInTheDocument();
  });

  it('veteran: Weekly 11.0; Dynasty composite lower than Weekly; long-term drivers cite age/durability', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /Darius Stone/i }));
    expect(weeklyEfo('declining-veteran')).toBe('11.0');
    const out = evaluateWideReceiver(getFixture('declining-veteran')!.input, { selected_horizon: 'DYNASTY' });
    expect(out.composites.DYNASTY).toBeLessThan(out.composites.WEEKLY);
    await userEvent.click(screen.getByRole('tab', { name: 'Dynasty' }));
    const limiting = screen.getByRole('heading', { name: /Limiting factors/i }).closest('section')!;
    expect(within(limiting).getAllByText(/durability|age/i).length).toBeGreaterThan(0);
  });

  it('deep threat: Weekly 7.7, TQ ≤ 65, volatility shows the actual model result (LOW)', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /Malik Comet/i }));
    expect(weeklyEfo('deep-threat-low-efficiency')).toBe('7.7');
    const tq = evaluateWideReceiver(getFixture('deep-threat-low-efficiency')!.input).components.TQ;
    expect(tq).toBeLessThanOrEqual(65);
    expect(screen.getByLabelText(/Target Quality score: 65\.0 out of 100/i)).toBeInTheDocument();
    // Volatility LOW is displayed faithfully (we do not force it to MEDIUM).
    expect(screen.getByText(/24\.4 · LOW/)).toBeInTheDocument();
  });
});

describe('§14.3 horizon behavior', () => {
  it('all five horizons are selectable and keep all eight components visible', async () => {
    renderPage();
    for (const label of ['Weekly', 'Rest of Season', 'One Year', 'Three Years', 'Dynasty']) {
      await userEvent.click(screen.getByRole('tab', { name: label }));
      // Eight component bars are always present.
      for (const name of ['Route Role', 'Target Earning', 'Target Quality', 'Efficiency', 'Team Context', 'Role Durability', 'Age & Development', 'Availability']) {
        expect(screen.getByText(name)).toBeInTheDocument();
      }
    }
  });

  it('long-term horizons show the deferral notice and no fabricated fantasy points', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: 'Dynasty' }));
    expect(screen.getByText(/not included in WR MVP v1\.0/i)).toBeInTheDocument();
    // Only Weekly and ROS projection cards exist — no "Dynasty projection" card.
    expect(screen.queryByText(/Dynasty projection/i)).not.toBeInTheDocument();
  });

  it('changing the horizon changes the ranked drivers', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /Darius Stone/i }));
    await userEvent.click(screen.getByRole('tab', { name: 'Weekly' }));
    const weeklyNeg = screen.getByRole('heading', { name: /Limiting factors/i }).closest('section')!.textContent;
    await userEvent.click(screen.getByRole('tab', { name: 'Dynasty' }));
    const dynastyNeg = screen.getByRole('heading', { name: /Limiting factors/i }).closest('section')!.textContent;
    expect(weeklyNeg).not.toEqual(dynastyNeg);
  });
});

describe('§14.4 accessibility', () => {
  it('player selector is keyboard operable with arrow keys', async () => {
    renderPage();
    const eliteTab = screen.getByRole('tab', { name: /Marcus Crown/i });
    eliteTab.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('heading', { level: 1, name: /jalen spark/i })).toBeInTheDocument();
  });

  it('horizon controls are keyboard operable and expose selected state', async () => {
    renderPage();
    const weekly = screen.getByRole('tab', { name: 'Weekly' });
    expect(weekly).toHaveAttribute('aria-selected', 'true');
    weekly.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Rest of Season' })).toHaveAttribute('aria-selected', 'true');
  });

  it('component scores expose accessible numeric labels', () => {
    renderPage();
    expect(screen.getByLabelText(/Route Role score: \d+\.\d out of 100/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Availability score: 98\.0 out of 100/i)).toBeInTheDocument();
  });
});
