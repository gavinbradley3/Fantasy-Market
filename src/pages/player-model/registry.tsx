// Position-module registry: the ONE place in the app that maps a position to its
// engine, fixtures, presentation adapter, and projection section. The shared page
// and shared sections never branch on position — they consume PositionModule.

import { evaluateWideReceiver } from '@/wr-model/engine';
import { evaluateRunningBack } from '@/rb-model/engine';
import type { Horizon } from '@/rb-model/types';

import { WR_FIXTURES, getFixture as getWrFixture } from '@/pages/wr/registry';
import { buildWrView } from '@/pages/wr/view';
import { WrProjection } from '@/pages/wr/WrProjection';

import {
  RB_CORE_FIXTURES,
  RB_EDGE_FIXTURES,
  getFixture as getRbFixture,
} from '@/pages/rb/registry';
import { buildRbView } from '@/pages/rb/view';
import { RbProjection } from '@/pages/rb/RbProjection';

import type {
  BuildResult,
  FixtureSummary,
  PositionModule,
  SelectorDatum,
  SupportedPosition,
} from '@/pages/player-model/types';

const summary = (f: { id: string; archetype: string; input: { player_name: string; team: string | null; age: number } }): FixtureSummary => ({
  id: f.id,
  archetype: f.archetype,
  playerName: f.input.player_name,
  team: f.input.team ?? null,
  age: f.input.age,
});

// ---------- WR module ----------
const WR_MODULE: PositionModule = {
  position: 'WR',
  fullLabel: 'Wide Receiver',
  primary: WR_FIXTURES.map(summary),
  edge: [],
  edgeGroupLabel: '',
  defaultFixtureId: WR_FIXTURES[0].id,
  selectorLabel: 'Select a WR profile',
  hasFixture: (id) => !!getWrFixture(id),
  selectorData() {
    const map: Record<string, SelectorDatum> = {};
    for (const f of WR_FIXTURES) {
      try {
        const out = evaluateWideReceiver(f.input, { selected_horizon: 'WEEKLY' });
        map[f.id] = {
          weeklyEfo: out.weekly.expected_fantasy_points,
          confidenceLabel: out.confidence.label,
          statusMarker: out.status === 'PARTIAL' ? 'PARTIAL' : undefined,
        };
      } catch {
        /* skip: selector shows "—" for a fixture that fails to evaluate */
      }
    }
    return map;
  },
  build(fixtureId: string, horizon: Horizon): BuildResult {
    const fixture = getWrFixture(fixtureId);
    if (!fixture) return { ok: false, message: 'The selected demo profile could not be loaded.' };
    try {
      const output = evaluateWideReceiver(fixture.input, { selected_horizon: horizon });
      return {
        ok: true,
        view: buildWrView(output, fixture, horizon),
        projection: <WrProjection output={output} />,
      };
    } catch (err) {
      if (import.meta.env.DEV) console.error('[player-model] WR evaluation error', err);
      return { ok: false, message: 'The WR model could not evaluate this profile because required data was invalid.' };
    }
  },
};

// ---------- RB module ----------
const RB_MODULE: PositionModule = {
  position: 'RB',
  fullLabel: 'Running Back',
  primary: RB_CORE_FIXTURES.map(summary),
  edge: RB_EDGE_FIXTURES.map(summary),
  edgeGroupLabel: 'Test scenarios',
  defaultFixtureId: RB_CORE_FIXTURES[0].id,
  selectorLabel: 'Select an RB profile',
  hasFixture: (id) => !!getRbFixture(id),
  selectorData() {
    const map: Record<string, SelectorDatum> = {};
    for (const f of [...RB_CORE_FIXTURES, ...RB_EDGE_FIXTURES]) {
      try {
        const out = evaluateRunningBack(f.input, { selected_horizon: 'WEEKLY' });
        const inactive = ['OUT', 'IR', 'PUP', 'SUSPENDED'].includes(f.input.injury_status);
        map[f.id] = {
          weeklyEfo: out.weekly.expected_fantasy_points,
          confidenceLabel: out.confidence.label,
          statusMarker: inactive ? 'OUT' : out.status === 'PARTIAL' ? 'PARTIAL' : undefined,
        };
      } catch {
        /* skip */
      }
    }
    return map;
  },
  build(fixtureId: string, horizon: Horizon): BuildResult {
    const fixture = getRbFixture(fixtureId);
    if (!fixture) return { ok: false, message: 'The selected demo profile could not be loaded.' };
    try {
      const output = evaluateRunningBack(fixture.input, { selected_horizon: horizon });
      return {
        ok: true,
        view: buildRbView(output, fixture, horizon),
        projection: <RbProjection output={output} input={fixture.input} />,
      };
    } catch (err) {
      if (import.meta.env.DEV) console.error('[player-model] RB evaluation error', err);
      return { ok: false, message: 'The RB model could not evaluate this profile because required data was invalid.' };
    }
  },
};

export const POSITION_MODULES: Record<SupportedPosition, PositionModule> = {
  WR: WR_MODULE,
  RB: RB_MODULE,
};

export const SUPPORTED_POSITIONS: SupportedPosition[] = ['WR', 'RB'];

export function isSupportedPosition(value: string | null): value is SupportedPosition {
  return value === 'WR' || value === 'RB';
}
