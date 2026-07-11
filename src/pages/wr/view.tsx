import { Link } from 'react-router-dom';
import { DEFAULT_REFERENCE_DISTRIBUTIONS } from '@/wr-model/referenceDistributions';
import type { Horizon, WRMVPOutput } from '@/wr-model/types';
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
} from '@/pages/wr/adapter';
import type { WRFixtureEntry } from '@/pages/wr/registry';
import type { DriverView, SharedPlayerModelView } from '@/pages/player-model/types';

// WR presentation adapter: WRMVPOutput → shared view model (display copy +
// formatting only; no formula logic). The projection node is rendered separately.
export function buildWrView(
  output: WRMVPOutput,
  fixture: WRFixtureEntry,
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
    position: 'WR',
    seedId: fixture.id,
    playerName: p.player_name,
    team: p.team ?? null,
    age: p.age,
    seasonsCompleted: p.nfl_seasons_completed,
    draftRound: p.draft_round ?? null,
    archetype: fixture.archetype,
    headerChips: [],

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
      details: [],
    },

    components,
    componentFootnote: `Each score is 0–100 where 50 is a league-average full-roster WR (the marker on each bar). Bars highlighted “key at this horizon” carry the most weight in the ${horizonMeta.label} profile.`,

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
      referenceVersion: DEFAULT_REFERENCE_DISTRIBUTIONS.version,
      asOfTimestamp: output.as_of_timestamp,
      status: output.status,
    },
    transparencyBody: (
      <>
        This WR MVP uses deterministic formulas and fictional fixture data. Weekly and ROS outputs are
        expected values, not guarantees. Market price, trade value, and long-term fantasy-point
        distributions are outside the current model.{' '}
        <Link to="/methodology" className="text-secondary hover:underline">
          Methodology
        </Link>
        .
      </>
    ),
  };
}
