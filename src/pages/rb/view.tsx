import { Link } from 'react-router-dom';
import type { Horizon, InjuryStatus, RBMVPOutput } from '@/rb-model/types';
import {
  CONFIDENCE_DEFINITION,
  CONFIDENCE_TONE,
  COMPONENT_META,
  COMPONENT_ORDER,
  DEFERRED_HORIZON_NOTICE,
  HORIZONS,
  VOLATILITY_DEFINITION,
  VOLATILITY_TONE,
  componentWeight,
  driverComponent,
  emphasizedComponents,
  fallbackSentence,
  fmtPct0,
} from '@/pages/rb/adapter';
import type { RBFixtureEntry } from '@/pages/rb/registry';
import type { DriverView, HeaderChip, SharedPlayerModelView, Tone } from '@/pages/player-model/types';

const INJURY_LABEL: Partial<Record<InjuryStatus, string>> = {
  QUESTIONABLE: 'Questionable',
  DOUBTFUL: 'Doubtful',
  OUT: 'Out',
  IR: 'Injured reserve',
  PUP: 'PUP',
  SUSPENDED: 'Suspended',
};

const INJURY_TONE: Partial<Record<InjuryStatus, Tone>> = {
  QUESTIONABLE: 'warning',
  DOUBTFUL: 'warning',
  OUT: 'down',
  IR: 'down',
  PUP: 'down',
  SUSPENDED: 'down',
};

function buildHeaderChips(entry: RBFixtureEntry, output: RBMVPOutput): HeaderChip[] {
  const chips: HeaderChip[] = [];
  const injury = entry.input.injury_status;
  if (INJURY_LABEL[injury]) chips.push({ label: INJURY_LABEL[injury]!, tone: INJURY_TONE[injury] ?? 'warning' });
  if (entry.input.role_change === 'PROMOTED') chips.push({ label: 'Role: promoted', tone: 'up' });
  if (entry.input.role_change === 'DEMOTED') chips.push({ label: 'Role: demoted', tone: 'down' });
  if (output.weekly.workload_ramp_factor < 1) {
    chips.push({ label: `Ramp ${fmtPct0(output.weekly.workload_ramp_factor)}`, tone: 'warning' });
  }
  if (entry.input.teammate_return_flag) chips.push({ label: 'Teammate returning', tone: 'warning' });
  return chips;
}

// RB presentation adapter: RBMVPOutput → shared view model (display copy +
// formatting only; no formula logic). The projection node is rendered separately.
export function buildRbView(
  output: RBMVPOutput,
  fixture: RBFixtureEntry,
  horizon: Horizon,
): SharedPlayerModelView {
  const p = fixture.input;
  const horizonMeta = HORIZONS.find((h) => h.key === horizon)!;
  const emphasized = emphasizedComponents(horizon);

  const components = COMPONENT_ORDER.map((key) => {
    const meta = COMPONENT_META[key];
    return {
      code: meta.code,
      name: meta.name,
      description: meta.description,
      score: output.components[key],
      weightPct: componentWeight(horizon, key),
      emphasized: emphasized.has(key),
    };
  });

  const toDrivers = (sentences: string[]): DriverView[] =>
    sentences.map((text) => ({ text, code: driverComponent(text) }));

  return {
    position: 'RB',
    seedId: fixture.id,
    playerName: p.player_name,
    team: p.team ?? null,
    age: p.age,
    seasonsCompleted: p.nfl_seasons_completed,
    draftRound: p.draft_round ?? null,
    archetype: fixture.archetype,
    headerChips: buildHeaderChips(fixture, output),

    confidence: {
      score: output.confidence.score,
      label: output.confidence.label,
      tone: CONFIDENCE_TONE[output.confidence.label],
      definition: CONFIDENCE_DEFINITION,
      penalties: output.confidence.penalties,
    },
    volatility: {
      score: output.volatility.score,
      label: output.volatility.label,
      tone: VOLATILITY_TONE[output.volatility.label],
      definition: VOLATILITY_DEFINITION,
      details: [
        { label: 'TD dependence', value: fmtPct0(output.volatility.td_dependence), tip: 'Share of active-game fantasy points expected from touchdowns.' },
        { label: 'Receiving dependence', value: fmtPct0(output.volatility.receiving_dependence), tip: 'Share of active-game fantasy points expected from reception scoring.' },
      ],
    },

    components,
    componentFootnote: `Each score is 0–100 where 50 is a league-average RB on the RB reference population (the marker on each bar). Bars highlighted “key at this horizon” carry the most weight in the ${horizonMeta.label} profile.`,

    compositeValue: output.composites[horizon],
    horizonBlurb: horizonMeta.blurb,
    hasProjection: horizonMeta.hasProjection,
    deferredNotice: DEFERRED_HORIZON_NOTICE,

    positiveDrivers: toDrivers(output.explanations.positive_drivers),
    negativeDrivers: toDrivers(output.explanations.negative_drivers),

    fallbacks: output.fallback_log.map((f) => ({
      sentence: fallbackSentence(f.field, f.fallback_used),
      penalty: f.confidence_penalty,
    })),

    meta: {
      schemaVersion: output.schema_version,
      modelVersion: output.model_version,
      referenceVersion: output.reference_version,
      asOfTimestamp: output.as_of_timestamp,
      status: output.status,
    },
    transparencyBody: (
      <>
        This RB MVP uses deterministic formulas and fictional fixture data. Weekly and ROS outputs are
        expected values, not guarantees. Long-term fantasy-point projections, market prices, trade
        values, and real-player data are outside the current model.{' '}
        <Link to="/methodology" className="text-secondary hover:underline">
          Methodology
        </Link>
        .
      </>
    ),
  };
}
