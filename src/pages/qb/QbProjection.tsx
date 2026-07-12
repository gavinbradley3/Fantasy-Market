import { SectionCard, StatCell } from '@/pages/player-model/ui';
import { fmt0, fmt1, fmtPct0 } from '@/pages/qb/adapter';
import type { QBMVPInput, QBMVPOutput } from '@/qb-model';

const CONDITIONAL_NOTE =
  'Weekly passing and rushing lines are conditional on the quarterback being active. Weekly expected fantasy points also fold in the probability of being inactive.';

function fmtInputPct(value: number | null): string {
  return value === null ? 'Model default' : fmtPct0(value);
}

function fmtInputScore(value: number | null): string {
  return value === null ? 'Model default' : fmt0(value);
}

// QB-specific projection section: passing + rushing decomposition and recovery-aware
// ROS, with quarterback context that WR/RB/TE do not surface — role security,
// rushing dependence, and scoring environment. All values come straight from
// evaluateQuarterback; the input-derived context cells are profile indicators only
// and never feed the model.
export function QbProjection({ output, input }: { output: QBMVPOutput; input: QBMVPInput }) {
  const efo = output.expected_fantasy_output;
  const c = efo.conditional_on_active;
  const v = output.volatility;

  return (
    <div className="space-y-3">
      {/* Primary Weekly card */}
      <SectionCard title="Weekly projection">
        <div className="grid gap-3 md:grid-cols-4">
          <StatCell
            label="Expected fantasy points"
            value={fmt1(efo.weekly_fantasy_points)}
            emphasis
            tip={CONDITIONAL_NOTE}
          />
          <StatCell label="Probability active" value={fmtPct0(efo.probability_active)} />
          <StatCell
            label="Points if active"
            value={fmt1(c.fantasy_points)}
            tip="Conditional-on-active expected fantasy points, before the probability of being inactive."
          />
          <StatCell label="Pass attempts" value={fmt1(c.pass_attempts)} />
        </div>
        <p className="mt-3 text-[11px] text-text-muted">{CONDITIONAL_NOTE}</p>
      </SectionCard>

      {/* Passing line */}
      <SectionCard title="Passing (if active)">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatCell label="Attempts" value={fmt1(c.pass_attempts)} />
          <StatCell label="Completions" value={fmt1(c.completions)} />
          <StatCell label="Comp. rate" value={fmtPct0(c.completion_rate)} />
          <StatCell label="Pass yards" value={fmt1(c.passing_yards)} />
          <StatCell label="Pass TDs" value={fmt1(c.passing_tds)} />
          <StatCell label="Interceptions" value={fmt1(c.interceptions)} />
        </div>
      </SectionCard>

      {/* Rushing line */}
      <SectionCard title="Rushing (if active)">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatCell label="Designed runs" value={fmt1(c.designed_rush_attempts)} tip="Expected designed QB rushes." />
          <StatCell label="Scrambles" value={fmt1(c.scrambles)} />
          <StatCell label="Total carries" value={fmt1(c.total_rush_attempts)} />
          <StatCell label="Rush yards" value={fmt1(c.rushing_yards)} />
          <StatCell label="Rush TDs" value={fmt1(c.rushing_tds)} />
          <StatCell label="Prob. active" value={fmtPct0(efo.probability_active)} />
        </div>
      </SectionCard>

      {/* ROS card */}
      <SectionCard title="Rest-of-season projection">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:max-w-xl">
          <StatCell label="Expected games remaining" value={fmt1(efo.expected_games_remaining)} />
          <StatCell
            label="Expected limited games"
            value={fmt1(efo.expected_games_limited)}
            tip="Games in the remaining-season window expected to carry a material workload limitation."
          />
          <StatCell label="ROS expected fantasy points" value={fmt1(efo.ros_fantasy_points)} emphasis />
        </div>
        <p className="mt-2 text-[11px] text-text-muted">
          ROS is recovery-aware: limited games apply a reduced workload and current active probability;
          later games apply a role-appropriate future start probability. Expected values, not guarantees.
        </p>
      </SectionCard>

      {/* Role dependence & QB context */}
      <SectionCard title="Role dependence & QB context">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <StatCell
            label="Rushing dependence"
            value={`${fmt0(v.rushing_dependence)}%`}
            tip="Share of expected active-game fantasy points that comes from rushing."
          />
          <StatCell
            label="Turnover risk"
            value={`${fmt0(v.turnover_risk)} / 100`}
            tip="Interception-rate percentile against the QB reference population."
          />
          <StatCell
            label="Role instability"
            value={`${fmt0(v.role_instability)} / 100`}
            tip="Inverse of role security (100 − role security)."
          />
          <StatCell
            label="Competition pressure"
            value={fmtInputPct(input.competition_pressure)}
            tip="Model input: normalized current competition / benching pressure."
          />
          <StatCell
            label="Offensive environment"
            value={fmtInputScore(input.offensive_environment_score)}
            tip="Model input (0–100): objective composite of team scoring and passing environment."
          />
          <StatCell
            label="Protection context"
            value={fmtInputScore(input.protection_context_score)}
            tip="Model input (0–100): objective protection context; 50 is neutral."
          />
        </div>
        <p className="mt-2 text-[11px] text-text-muted">
          Competition pressure, offensive environment, and protection context are model inputs / profile
          indicators, not directly observed facts.
        </p>
      </SectionCard>
    </div>
  );
}
