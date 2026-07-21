// Human-readable rendering of a FrontierReport (deterministic).

import type { FrontierReport, ScenarioId } from '@/pipeline/readiness-audit/frontier';
import { SCENARIOS } from '@/pipeline/readiness-audit/frontier';

const SCENARIO_LABEL: Record<ScenarioId, string> = {
  CURRENT: 'current',
  STATS_FREE: 'stats(free) solved',
  CONTEXT_ONLY: 'context only',
  PROJECTIONS_ONLY: 'projections only',
  CONTEXT_PLUS_PROJECTIONS: 'context + projections',
  ALL_FREE_SOLVABLE: 'all free-solvable',
  FREE_PLUS_SPEC_FALLBACK: 'free + spec fallback',
  AUTHORED_SUPPLEMENT: 'authored supplement',
};

export function renderFrontier(r: FrontierReport): string {
  const lines: string[] = [];
  const L = (s: string) => lines.push(s);
  L('PlayerTicker readiness-frontier audit');
  L(`  generatedAt: ${r.generatedAt}`);
  L(`  players assessed: ${r.playersAssessed}, currently ready: ${r.currentlyReady}`);
  L('  Newly-READY player count by scenario (player-level, not field-level):');
  for (const s of SCENARIOS) {
    L(`    ${SCENARIO_LABEL[s].padEnd(24)} → ready: ${r.scenarioReadyCounts[s]}`);
  }
  L('  Position summaries (ready counts):');
  for (const p of r.positionSummaries) {
    L(
      `    ${p.position}: assessed ${p.playersAssessed}, now ${p.currentlyReady}, ` +
        `ctx ${p.readyAfter.CONTEXT_ONLY}, proj ${p.readyAfter.PROJECTIONS_ONLY}, ` +
        `ctx+proj ${p.readyAfter.CONTEXT_PLUS_PROJECTIONS}, allFree ${p.readyAfter.ALL_FREE_SOLVABLE}, ` +
        `free+spec ${p.readyAfter.FREE_PLUS_SPEC_FALLBACK}, authored ${p.readyAfter.AUTHORED_SUPPLEMENT}`,
    );
    if (r.universalBlockersByPosition[p.position].length > 0) {
      L(`       universal blockers: ${r.universalBlockersByPosition[p.position].join(', ')}`);
    }
  }
  L('  Final blockers after context + projections (the true wall):');
  L(`    ${r.finalBlockersAfterContextProjections.join(', ') || '(none)'}`);
  L('  Most frequent blockers:');
  for (const b of r.mostFrequentBlockers.slice(0, 12)) L(`    ${b.field}: ${b.players} players`);
  L('  Field criticality (blocking fields, by availability):');
  for (const f of r.fieldCriticality.slice(0, 30)) {
    L(
      `    ${f.position} ${f.field.padEnd(30)} ${f.stage.padEnd(11)} ${f.availability.padEnd(20)} ` +
        `blocks ${f.playersBlocked}${f.specFallback ? ' [spec-fallback]' : ''}`,
    );
  }
  return lines.join('\n');
}
