import { SectionCard, StatCell } from '@/pages/player-model/ui';
import { fmt1, fmtPct0 } from '@/pages/te/adapter';
import type { TEMVPInput, TEMVPOutput } from '@/te-model';

const CONDITIONAL_NOTE =
  'Weekly routes, targets, receptions, and yardage are conditional on the tight end being active. Expected fantasy points also include the probability of being inactive.';

function fmtRate(value: number | null): string {
  return value === null ? 'Model default' : fmtPct0(value);
}

// TE-specific projection section: receiving-only, with tight-end context that WR
// and RB do not surface — route role vs. blocking snaps, red-zone / end-zone
// usage, competition, and touchdown / explosive dependence. All values come
// straight from evaluateTightEnd; the input-derived context cells are profile
// indicators only and never feed the model.
export function TeProjection({ output, input }: { output: TEMVPOutput; input: TEMVPInput }) {
  const w = output.weekly;
  const r = output.ros;
  const v = output.volatility;
  const rampBelowFull = w.workload_ramp_factor < 1;

  return (
    <div className="space-y-3">
      {/* Primary Weekly card */}
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
            tip="Share of the expected full workload the tight end is ramped to this week."
          />
          <StatCell label="Expected targets" value={fmt1(w.expected_targets)} />
        </div>
        <p className="mt-3 text-[11px] text-text-muted">{CONDITIONAL_NOTE}</p>
      </SectionCard>

      {/* Receiving line */}
      <SectionCard title="Receiving">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatCell label="Routes" value={fmt1(w.expected_routes)} tip="Routes run — blocking snaps are excluded." />
          <StatCell label="Targets" value={fmt1(w.expected_targets)} />
          <StatCell label="Receptions" value={fmt1(w.expected_receptions)} />
          <StatCell label="Rec. yards" value={fmt1(w.expected_receiving_yards)} />
          <StatCell label="Rec. TDs" value={fmt1(w.expected_receiving_touchdowns)} />
          <StatCell label="Prob. active" value={fmtPct0(w.probability_active)} />
        </div>
      </SectionCard>

      {/* ROS card */}
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

      {/* Role dependence & tight-end context */}
      <SectionCard title="Role dependence & TE context">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <StatCell
            label="TD dependence"
            value={fmtPct0(v.td_dependence)}
            tip="Share of active-game fantasy points expected from touchdowns."
          />
          <StatCell
            label="Explosive dependence"
            value={fmtPct0(v.explosive_dependence)}
            tip="Relative reliance on explosive (long) receiving gains, on a 0–100% scale."
          />
          <StatCell
            label="Snap share"
            value={fmtRate(input.snap_share_last4)}
            tip="Model input: share of team snaps over the last four games. Snaps are not routes."
          />
          <StatCell
            label="Red-zone target rate"
            value={fmtRate(input.red_zone_target_rate)}
            tip="Model input: share of the tight end's targets that come inside the red zone."
          />
          <StatCell
            label="End-zone target rate"
            value={fmtRate(input.end_zone_target_rate)}
            tip="Model input: share of the tight end's targets thrown into the end zone."
          />
          <StatCell
            label="Competition pressure"
            value={fmtRate(input.competition_pressure)}
            tip="Model input representing how much other receiving options threaten the current role."
          />
        </div>
        <p className="mt-2 text-[11px] text-text-muted">
          Snap share, red-zone / end-zone rates, and competition pressure are model inputs / profile
          indicators, not directly observed facts.
        </p>
      </SectionCard>
    </div>
  );
}
