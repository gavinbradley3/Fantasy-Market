// Shared presentation types for the position-flexible Player Model experience.
// The engines (WR/RB) stay entirely separate; these types describe only what the
// shared shell + shared sections need to render. Position-specific projection
// payloads are NOT merged here — each position module renders its own projection
// node — so there is no every-field-nullable soup.

import type { ReactNode } from 'react';

export type SupportedPosition = 'WR' | 'RB' | 'TE';

export type Tone = 'up' | 'warning' | 'down' | 'neutral';

// One 0–100 component score, already resolved for the selected horizon.
export interface ComponentView {
  code: string;
  name: string;
  description: string;
  score: number;
  weightPct: number; // weight at the selected horizon (drives emphasis + display)
  emphasized: boolean;
}

// One explanation driver + the component chip it maps to (display only).
export interface DriverView {
  text: string;
  code?: string;
}

// One fallback log entry rendered as a readable sentence.
export interface FallbackView {
  sentence: string;
  penalty: number;
}

// A compact status marker shown beside the summary header (RB role/injury/etc).
export interface HeaderChip {
  label: string;
  tone: Tone;
}

// A small labeled value used in the confidence/volatility detail lists.
export interface LabeledValue {
  label: string;
  value: string;
  tip?: string;
}

export interface MetaView {
  schemaVersion: string;
  modelVersion: string;
  referenceVersion: string;
  asOfTimestamp: string;
  status: 'OK' | 'PARTIAL';
}

// Everything the shared shell + shared sections render for one player at one
// horizon. Position-specific projection UI is rendered separately (see
// PositionModule.build → projection node).
export interface SharedPlayerModelView {
  position: SupportedPosition;
  seedId: string; // avatar seed
  playerName: string;
  team: string | null;
  age: number;
  seasonsCompleted: number;
  draftRound: number | null;
  archetype: string;
  headerChips: HeaderChip[]; // RB context (role/injury/ramp/competition); WR: []

  confidence: {
    score: number;
    label: string;
    tone: Tone;
    definition: string;
    penalties: string[];
  };
  volatility: {
    score: number;
    label: string;
    tone: Tone;
    definition: string;
    details: LabeledValue[]; // RB: TD + receiving dependence; WR: []
  };

  components: ComponentView[];
  componentFootnote: string;

  compositeValue: number;
  horizonBlurb: string;
  hasProjection: boolean;
  deferredNotice: string;

  positiveDrivers: DriverView[];
  negativeDrivers: DriverView[];

  fallbacks: FallbackView[];

  meta: MetaView;
  transparencyBody: ReactNode;
}

// A fixture as shown in the selector (static copy). Dynamic values (Weekly EFO,
// confidence label, status marker) come from the engine via SelectorDatum.
export interface FixtureSummary {
  id: string;
  playerName: string;
  archetype: string;
  team: string | null;
  age: number;
}

// Engine-derived selector data for one fixture.
export interface SelectorDatum {
  weeklyEfo: number;
  confidenceLabel: string;
  statusMarker?: string; // e.g. "OUT", "PARTIAL"
}

export type BuildResult =
  | { ok: true; view: SharedPlayerModelView; projection: ReactNode }
  | { ok: false; message: string };

// One position's contribution to the shared page. The registry maps
// SupportedPosition → PositionModule; this is the ONLY position switch in the app.
export interface PositionModule {
  position: SupportedPosition;
  fullLabel: string; // "Wide Receiver"
  primary: FixtureSummary[];
  edge: FixtureSummary[]; // secondary "Test scenarios" group ([] for WR)
  edgeGroupLabel: string;
  defaultFixtureId: string;
  selectorLabel: string; // player-selector aria-label, e.g. "Select a WR profile"
  hasFixture(id: string): boolean;
  selectorData(): Record<string, SelectorDatum>;
  build(fixtureId: string, horizon: import('@/rb-model/types').Horizon): BuildResult;
}
