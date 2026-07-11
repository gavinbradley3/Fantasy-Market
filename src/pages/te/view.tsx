import { Link } from 'react-router-dom';
import type { TEHorizon, TEMVPInput, TEMVPOutput } from '@/te-model';

// Derived from the public input contract so no internal TE type export is needed.
type TEInjuryStatus = TEMVPInput['injury_status'];
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
  penaltyLabel,
} from '@/pages/te/adapter';
import type { TEFixtureEntry } from '@/pages/te/registry';
import type { DriverView, HeaderChip, SharedPlayerModelView, Tone } from '@/pages/player-model/types';

const INJURY_LABEL: Partial<Record<TEInjuryStatus, string>> = {
  QUESTIONABLE: 'Questionable',
  DOUBTFUL: 'Doubtful',
  OUT: 'Out',
  IR: 'Injured reserve',
  PUP: 'PUP',
  SUSPENDED: 'Suspended',
  UNKNOWN: 'Status unknown',
};

const INJURY_TONE: Partial<Record<TEInjuryStatus, Tone>> = {
  QUESTIONABLE: 'warning',
  DOUBTFUL: 'warning',
  OUT: 'down',
  IR: 'down',
  PUP: 'down',
  SUSPENDED: 'down',
  UNKNOWN: 'warning',
};

function buildHeaderChips(entry: TEFixtureEntry, output: TEMVPOutput): HeaderChip[] {
  const chips: HeaderChip[] = [];
  const i = entry.input;
  if (INJURY_LABEL[i.injury_status]) {
    chips.push({ label: INJURY_LABEL[i.injury_status]!, tone: INJURY_TONE[i.injury_status] ?? 'warning' });
  }
  if (i.depth_chart_role === 'TE1') chips.push({ label: 'TE1', tone: 'up' });
  if (i.depth_chart_role === 'TE3_OR_DEPTH') chips.push({ label: 'Depth TE', tone: 'down' });
  if (i.role_change === 'PROMOTED') chips.push({ label: 'Role: promoted', tone: 'up' });
  if (i.role_change === 'DEMOTED') chips.push({ label: 'Role: demoted', tone: 'down' });
  if (output.weekly.workload_ramp_factor < 1 && output.weekly.workload_ramp_factor > 0) {
    chips.push({ label: `Ramp ${fmtPct0(output.weekly.workload_ramp_factor)}`, tone: 'warning' });
  }
  if (i.prospect_type === 'BLOCKING_FIRST') chips.push({ label: 'Blocking-first', tone: 'neutral' });
  if (i.another_receiving_te_flag) chips.push({ label: 'Rival receiving TE', tone: 'warning' });
  if (i.temporary_opportunity_flag) chips.push({ label: 'Temporary role', tone: 'warning' });
  if (i.new_team_flag) chips.push({ label: 'New team', tone: 'warning' });
  return chips;
}

// TE presentation adapter: TEMVPOutput → shared view model (display copy +
// formatting only; no formula logic). The projection node is rendered separately.
export function buildTeView(
  output: TEMVPOutput,
  fixture: TEFixtureEntry,
  horizon: TEHorizon,
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
    position: 'TE',
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
      penalties: output.confidence.penalties.map(penaltyLabel),
    },
    volatility: {
      score: output.volatility.score,
      label: output.volatility.label,
      tone: VOLATILITY_TONE[output.volatility.label],
      definition: VOLATILITY_DEFINITION,
      details: [
        { label: 'TD dependence', value: fmtPct0(output.volatility.td_dependence), tip: 'Share of active-game fantasy points expected from touchdowns.' },
        { label: 'Explosive dependence', value: fmtPct0(output.volatility.explosive_dependence), tip: 'Relative reliance on explosive (long) receiving gains, on a 0–100% scale.' },
      ],
    },

    components,
    componentFootnote: `Each score is 0–100 where 50 is a league-average TE on the TE reference population (the marker on each bar). Bars highlighted “key at this horizon” carry the most weight in the ${horizonMeta.label} profile.`,

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
        This TE MVP uses deterministic formulas and fictional fixture data. Weekly and ROS outputs are
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
