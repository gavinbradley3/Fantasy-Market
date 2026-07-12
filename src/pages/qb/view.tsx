import { Link } from 'react-router-dom';
import type { QBHorizon, QBMVPInput, QBMVPOutput } from '@/qb-model';

// Derived from the public input contract so no internal QB type export is needed.
type QBInjuryStatus = QBMVPInput['injury_status'];
type QBRoleStatus = QBMVPInput['role_status'];
type QBDepthChartStatus = QBMVPInput['depth_chart_status'];

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
  compositeKey,
  driverComponent,
  emphasizedComponents,
  fallbackSentence,
  fmt0,
  penaltyLabel,
} from '@/pages/qb/adapter';
import type { QBFixtureEntry } from '@/pages/qb/registry';
import type { DriverView, HeaderChip, SharedPlayerModelView, Tone } from '@/pages/player-model/types';

const INJURY_LABEL: Partial<Record<QBInjuryStatus, string>> = {
  QUESTIONABLE: 'Questionable',
  DOUBTFUL: 'Doubtful',
  OUT: 'Out',
  IR: 'Injured reserve',
  PUP: 'PUP',
};

const INJURY_TONE: Partial<Record<QBInjuryStatus, Tone>> = {
  QUESTIONABLE: 'warning',
  DOUBTFUL: 'warning',
  OUT: 'down',
  IR: 'down',
  PUP: 'down',
};

const ROLE_CHIP: Partial<Record<QBRoleStatus, { label: string; tone: Tone }>> = {
  YOUNG_COMMITTED_STARTER: { label: 'Young committed starter', tone: 'up' },
  ROOKIE_EXPECTED_STARTER: { label: 'Rookie starter', tone: 'neutral' },
  BRIDGE_STARTER: { label: 'Bridge starter', tone: 'neutral' },
  TEMPORARY_INJURY_REPLACEMENT: { label: 'Temporary starter', tone: 'warning' },
  COMPETITION: { label: 'Job competition', tone: 'warning' },
  RECENTLY_BENCHED: { label: 'Recently benched', tone: 'down' },
  BACKUP: { label: 'Backup', tone: 'down' },
};

const DEPTH_CHIP: Partial<Record<QBDepthChartStatus, { label: string; tone: Tone }>> = {
  CO_STARTER: { label: 'Co-starter', tone: 'warning' },
  BACKUP: { label: 'Depth: backup', tone: 'down' },
  PRACTICE_SQUAD: { label: 'Practice squad', tone: 'down' },
  FREE_AGENT: { label: 'Free agent', tone: 'down' },
};

function buildHeaderChips(entry: QBFixtureEntry): HeaderChip[] {
  const chips: HeaderChip[] = [];
  const i = entry.input;
  if (INJURY_LABEL[i.injury_status]) {
    chips.push({ label: INJURY_LABEL[i.injury_status]!, tone: INJURY_TONE[i.injury_status] ?? 'warning' });
  }
  if (ROLE_CHIP[i.role_status]) chips.push(ROLE_CHIP[i.role_status]!);
  if (DEPTH_CHIP[i.depth_chart_status]) chips.push(DEPTH_CHIP[i.depth_chart_status]!);
  if (i.team_change) chips.push({ label: 'New team', tone: 'warning' });
  if (i.major_system_change) chips.push({ label: 'New system', tone: 'warning' });
  if (i.recent_role_change) chips.push({ label: 'Recent role change', tone: 'warning' });
  return chips;
}

// QB presentation adapter: QBMVPOutput → shared view model (display copy +
// formatting only; no formula logic). The projection node is rendered separately.
export function buildQbView(
  output: QBMVPOutput,
  fixture: QBFixtureEntry,
  horizon: QBHorizon,
): SharedPlayerModelView {
  const p = fixture.input;
  const horizonMeta = HORIZONS.find((h) => h.key === horizon)!;
  const emphasized = emphasizedComponents(horizon);

  const components = COMPONENT_ORDER.map((code) => {
    const meta = COMPONENT_META[code];
    return {
      code: meta.code,
      name: meta.name,
      description: meta.description,
      score: output.components[meta.outputKey],
      weightPct: componentWeight(horizon, code),
      emphasized: emphasized.has(code),
    };
  });

  const toDrivers = (sentences: string[]): DriverView[] =>
    sentences.map((text) => ({ text, code: driverComponent(text) }));

  return {
    position: 'QB',
    seedId: fixture.id,
    playerName: p.player_name,
    team: p.team ?? null,
    age: p.age,
    seasonsCompleted: p.nfl_seasons_completed,
    draftRound: p.draft_round ?? null,
    archetype: fixture.archetype,
    headerChips: buildHeaderChips(fixture),

    confidence: {
      score: output.confidence.score,
      label: output.confidence.label,
      tone: CONFIDENCE_TONE[output.confidence.label],
      definition: CONFIDENCE_DEFINITION,
      penalties: output.confidence.penalty_codes.map(penaltyLabel),
    },
    volatility: {
      score: output.volatility.score,
      label: output.volatility.label,
      tone: VOLATILITY_TONE[output.volatility.label],
      definition: VOLATILITY_DEFINITION,
      details: [
        { label: 'Rushing dependence', value: `${fmt0(output.volatility.rushing_dependence)}%`, tip: 'Share of expected active-game fantasy points that comes from rushing.' },
        { label: 'Turnover risk', value: `${fmt0(output.volatility.turnover_risk)} / 100`, tip: 'Interception-rate percentile against the QB reference population (higher = more turnover-prone).' },
        { label: 'Role instability', value: `${fmt0(output.volatility.role_instability)} / 100`, tip: 'Inverse of role security (100 − role security); higher means a less secure starting job.' },
      ],
    },

    components,
    componentFootnote: `Each score is 0–100 where 50 is a league-average QB on the QB reference population (the marker on each bar). Bars highlighted “key at this horizon” carry the most weight in the ${horizonMeta.label} profile.`,

    compositeValue: output.composites[compositeKey(horizon)],
    horizonBlurb: horizonMeta.blurb,
    hasProjection: horizonMeta.hasProjection,
    deferredNotice: DEFERRED_HORIZON_NOTICE,

    positiveDrivers: toDrivers(output.explanations.positive),
    negativeDrivers: toDrivers(output.explanations.negative),

    fallbacks: output.fallback_log.map((code) => ({
      sentence: fallbackSentence(code),
    })),

    meta: {
      schemaVersion: output.schema_version,
      modelVersion: output.model_version,
      referenceVersion: output.reference_version,
      asOfTimestamp: output.player.as_of,
      status: output.status,
    },
    transparencyBody: (
      <>
        This QB MVP uses deterministic formulas and fictional fixture data. Weekly and ROS outputs are
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
