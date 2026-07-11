import { SectionCard, StatCell } from '@/pages/player-model/ui';
import { fmt1, fmtPct0 } from '@/pages/rb/adapter';
import type { RBMVPInput, RBMVPOutput } from '@/rb-model/types';

const CONDITIONAL_NOTE =
  'Weekly carries, routes, targets, and yardage are conditional on the player being active. Expected fantasy points also include the probability of being inactive.';

function fmtInput(value: number | null): string {
  return value === null ? 'Model default' : fmtPct0(value);
}

// RB-specific projection section (§12 + §15). Rushing and receiving are distinct;
// the primary Weekly card carries expected fantasy points, availability, ramp, and
// a UI-derived expected-total-opportunities figure (carries + targets) that never
// feeds the engine. All values come straight from evaluateRunningBack.
export function RbProjection({ output, input }: { output: RBMVPOutput; input: RBMVPInput }) {
  const w = output.weekly;
  const r = output.ros;
  const v = output.volatility;
  // UI-derived display total only — not an engine input, does not alter any output.
  const expectedTotalOpportunities = w.expected_carries + w.expected_targets;
  const rampBelowFull = w.workload_ramp_factor < 1;

  return (
    <div className="space-y-3">
      {/* 12.1 Primary Weekly card */}
      <SectionCard title="Weekly projection">
        <div className="grid gap-3 md:grid-cols-4">
          <StatCell
            label="Expected fantasy points"
            value={fmt1(w.expected_fantasy_points)}
            emphasis
            tip={CONDITIONAL_NOTE}
          />
          <StatCell label="Probability active" value={fmtPct0(w.probability_active)} />
          <StatCell
            label="Workload ramp"
            value={fmtPct0(w.workload_ramp_factor)}
            tip="Share of expected full workload the player is ramped to this week."
          />
          <StatCell
            label="Expected total opportunities"
            value={fmt1(expectedTotalOpportunities)}
            tip="Display total: expected carries + expected targets. This is derived for the UI and does not feed the model."
          />
        </div>
        <p className="mt-3 text-[11px] text-text-muted">{CONDITIONAL_NOTE}</p>
      </SectionCard>

      {/* 12.2 + 12.3 Rushing and receiving, side by side on desktop */}
      <div className="grid gap-3 md:grid-cols-2">
        <SectionCard title="Rushing">
          <div className="grid grid-cols-3 gap-2">
            <StatCell label="Carries" value={fmt1(w.expected_carries)} />
            <StatCell label="Rush yards" value={fmt1(w.expected_rushing_yards)} />
            <StatCell label="Rush TDs" value={fmt1(w.expected_rushing_touchdowns)} />
          </div>
        </SectionCard>
        <SectionCard title="Receiving">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            <StatCell label="Routes" value={fmt1(w.expected_routes)} />
            <StatCell label="Targets" value={fmt1(w.expected_targets)} />
            <StatCell label="Receptions" value={fmt1(w.expected_receptions)} />
            <StatCell label="Rec. yards" value={fmt1(w.expected_receiving_yards)} />
            <StatCell label="Rec. TDs" value={fmt1(w.expected_receiving_touchdowns)} />
          </div>
        </SectionCard>
      </div>

      {/* 12.4 ROS card */}
      <SectionCard title="Rest-of-season projection">
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          <StatCell label="Expected active games" value={fmt1(r.expected_active_games)} />
          <StatCell label="ROS expected fantasy points" value={fmt1(r.expected_fantasy_points)} emphasis />
        </div>
        {rampBelowFull && (
          <p className="mt-3 text-[11px] text-text-muted">
            ROS applies the current workload ramp to the first expected active game and assumes full
            workload afterward.
          </p>
        )}
        <p className="mt-2 text-[11px] text-text-muted">
          Expected values, not guarantees. No confidence intervals are implied.
        </p>
      </SectionCard>

      {/* 15 Role-dependence / context indicators */}
      <SectionCard title="Role dependence & context">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <StatCell
            label="TD dependence"
            value={fmtPct0(v.td_dependence)}
            tip="Share of active-game fantasy points expected from touchdowns."
          />
          <StatCell
            label="Receiving dependence"
            value={fmtPct0(v.receiving_dependence)}
            tip="Share of active-game fantasy points expected from reception scoring."
          />
          <StatCell
            label="Competition pressure"
            value={fmtInput(input.competition_pressure)}
            tip="Model input representing how much other active backs threaten the current role."
          />
          <StatCell
            label="QB rush pressure"
            value={fmtInput(input.qb_rush_pressure)}
            tip="Model input representing how much quarterback rushing may reduce RB carries and goal-line opportunity."
          />
        </div>
        <p className="mt-2 text-[11px] text-text-muted">
          Competition pressure and QB rush pressure are model inputs / profile indicators, not
          directly observed facts.
        </p>
      </SectionCard>
    </div>
  );
}
