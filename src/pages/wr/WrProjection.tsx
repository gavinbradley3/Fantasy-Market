import { SectionCard, StatCell } from '@/pages/player-model/ui';
import { fmt1, fmtPct0 } from '@/pages/wr/adapter';
import type { WRMVPOutput } from '@/wr-model/types';

// WR-specific projection section: receiving-only stat cards. Weekly and ROS
// expected fantasy points come straight from evaluateWideReceiver.
export function WrProjection({ output }: { output: WRMVPOutput }) {
  const w = output.weekly;
  const r = output.ros;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SectionCard title="Weekly projection">
        <div className="mb-3">
          <StatCell label="Expected fantasy points" value={fmt1(w.expected_fantasy_points)} emphasis />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatCell label="Routes" value={fmt1(w.expected_routes)} />
          <StatCell label="Targets" value={fmt1(w.expected_targets)} />
          <StatCell label="Receptions" value={fmt1(w.expected_receptions)} />
          <StatCell label="Rec. yards" value={fmt1(w.expected_receiving_yards)} />
          <StatCell label="Rec. TDs" value={fmt1(w.expected_receiving_touchdowns)} />
          <StatCell label="Prob. active" value={fmtPct0(w.probability_active)} />
        </div>
      </SectionCard>

      <SectionCard title="Rest-of-season projection">
        <div className="mb-3">
          <StatCell label="Expected fantasy points" value={fmt1(r.expected_fantasy_points)} emphasis />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatCell label="Expected active games" value={fmt1(r.expected_active_games)} />
          <StatCell label="Prob. active / game" value={fmtPct0(w.probability_active)} />
        </div>
        <p className="mt-3 text-[11px] text-text-muted">
          Expected values, not guarantees. No confidence intervals are implied.
        </p>
      </SectionCard>
    </div>
  );
}
