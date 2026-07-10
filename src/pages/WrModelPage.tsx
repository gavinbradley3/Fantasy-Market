import { useMemo, useState } from 'react';
import { evaluateWideReceiver } from '@/wr-model/engine';
import { DEFAULT_REFERENCE_DISTRIBUTIONS } from '@/wr-model/referenceDistributions';
import type { Horizon, WRMVPOutput } from '@/wr-model/types';
import { DEFAULT_FIXTURE_ID, WR_FIXTURES, getFixture } from '@/pages/wr/registry';
import { HORIZONS } from '@/pages/wr/adapter';
import { PlayerSelector } from '@/pages/wr/PlayerSelector';
import { ComponentProfile } from '@/pages/wr/ComponentProfile';
import { SectionCard } from '@/pages/wr/ui';
import {
  ConfidenceVolatilityPanel,
  DemoDisclosure,
  DriverSections,
  FallbackPanel,
  HorizonContext,
  HorizonSelector,
  ModelTransparencyFooter,
  PlayerSummaryHeader,
  ProjectionCards,
} from '@/pages/wr/sections';
import { ErrorState } from '@/components/states';

const DEFAULT_HORIZON: Horizon = 'WEEKLY';

// Evaluate one fixture at one horizon, defensively. Never throws to render:
// validation/other errors become a typed error result the page can display.
function evaluate(fixtureId: string, horizon: Horizon):
  | { ok: true; output: WRMVPOutput }
  | { ok: false; kind: 'fixture' | 'model'; message: string } {
  const fixture = getFixture(fixtureId);
  if (!fixture) {
    return { ok: false, kind: 'fixture', message: 'The selected demo profile could not be loaded.' };
  }
  try {
    const output = evaluateWideReceiver(fixture.input, { selected_horizon: horizon });
    return { ok: true, output };
  } catch (err) {
    if (import.meta.env.DEV) console.error('[wr-model] evaluation error', err);
    return {
      ok: false,
      kind: 'model',
      message: 'The WR model could not evaluate this profile because required data was invalid.',
    };
  }
}

export default function WrModelPage() {
  const [fixtureId, setFixtureId] = useState<string>(DEFAULT_FIXTURE_ID);
  const [horizon, setHorizon] = useState<Horizon>(DEFAULT_HORIZON);

  // Weekly EFO for every fixture (for the selector) — from the engine, memoized.
  const weeklyEfoById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const f of WR_FIXTURES) {
      const r = evaluate(f.id, 'WEEKLY');
      if (r.ok) map[f.id] = r.output.weekly.expected_fantasy_points;
    }
    return map;
  }, []);

  const result = useMemo(() => evaluate(fixtureId, horizon), [fixtureId, horizon]);
  const fixture = getFixture(fixtureId);
  const horizonMeta = HORIZONS.find((h) => h.key === horizon)!;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="sr-only">WR Model demo</h1>
        <DemoDisclosure />
      </div>

      <SectionCard title="Choose a WR profile">
        <PlayerSelector
          fixtures={WR_FIXTURES}
          weeklyEfoById={weeklyEfoById}
          selectedId={fixtureId}
          onSelect={setFixtureId}
        />
      </SectionCard>

      {!result.ok || !fixture ? (
        <ErrorState message={result.ok ? 'The selected demo profile could not be loaded.' : result.message} />
      ) : (
        <>
          <PlayerSummaryHeader fixture={fixture} output={result.output} />

          <ProjectionCards output={result.output} />

          <SectionCard title="Valuation horizon">
            <HorizonSelector selected={horizon} onSelect={setHorizon} />
            <p className="mt-2 text-[11px] text-text-muted">
              The horizon changes which factors the model emphasizes and how the drivers below are
              ranked. Weekly and Rest-of-Season include fantasy-point projections; longer horizons
              summarize the component profile only.
            </p>
          </SectionCard>

          <HorizonContext horizonMeta={horizonMeta} compositeValue={result.output.composites[horizon]} />

          <SectionCard title="Component profile">
            <ComponentProfile components={result.output.components} horizon={horizon} />
            <p className="mt-2 text-[11px] text-text-muted">
              Each score is 0–100 where 50 is a league-average full-roster WR (the marker on each bar).
              Bars highlighted “key at this horizon” carry the most weight in the {horizonMeta.label}{' '}
              profile.
            </p>
          </SectionCard>

          <DriverSections output={result.output} />

          <ConfidenceVolatilityPanel output={result.output} />

          <FallbackPanel output={result.output} />

          <ModelTransparencyFooter
            output={result.output}
            referenceVersion={DEFAULT_REFERENCE_DISTRIBUTIONS.version}
          />
        </>
      )}
    </div>
  );
}
