import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Horizon } from '@/rb-model/types';
import { ErrorState } from '@/components/states';
import { SectionCard } from '@/pages/player-model/ui';
import { PositionSelector } from '@/pages/player-model/PositionSelector';
import { PlayerSelector } from '@/pages/player-model/PlayerSelector';
import {
  ComponentProfile,
  ConfidenceVolatilityPanel,
  DemoDisclosure,
  DriverSections,
  FallbackPanel,
  HorizonContext,
  HorizonSelector,
  ModelTransparencyFooter,
  PlayerSummaryHeader,
} from '@/pages/player-model/sections';
import { POSITION_MODULES, isSupportedPosition } from '@/pages/player-model/registry';
import type { SupportedPosition } from '@/pages/player-model/types';

const DEFAULT_HORIZON: Horizon = 'WEEKLY';

// The shared, position-flexible model page. One shell + shared sections drive both
// WR and RB; the only position switch is the module lookup below. Position is
// reflected in the `position` query param so a position is shareable/bookmarkable.
export default function PlayerModelPage({
  defaultPosition = 'WR',
}: {
  defaultPosition?: SupportedPosition;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPos = searchParams.get('position');
  const position: SupportedPosition = isSupportedPosition(urlPos) ? urlPos : defaultPosition;
  const mod = POSITION_MODULES[position];

  const [fixtureId, setFixtureId] = useState<string>(mod.defaultFixtureId);
  const [horizon, setHorizon] = useState<Horizon>(DEFAULT_HORIZON);

  // Guard: if the selected fixture id isn't valid for the current position, fall
  // back to that position's default (both in-render and as synced state).
  const effectiveFixtureId = mod.hasFixture(fixtureId) ? fixtureId : mod.defaultFixtureId;
  useEffect(() => {
    if (!mod.hasFixture(fixtureId)) setFixtureId(mod.defaultFixtureId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  const changePosition = (next: SupportedPosition) => {
    if (next === position) return;
    // Select the new position's default player; preserve the selected horizon.
    setFixtureId(POSITION_MODULES[next].defaultFixtureId);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('position', next);
        return p;
      },
      { replace: true },
    );
  };

  const selectorData = useMemo(() => mod.selectorData(), [position]);
  const result = useMemo(
    () => mod.build(effectiveFixtureId, horizon),
    [position, effectiveFixtureId, horizon],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* 1) Demo disclosure */}
      <DemoDisclosure />

      {/* 2) Position selector */}
      <SectionCard title="Position">
        <PositionSelector selected={position} onSelect={changePosition} />
      </SectionCard>

      {/* 3) Player selector */}
      <SectionCard title="Choose a profile">
        <PlayerSelector
          label={mod.selectorLabel}
          fixtures={mod.primary}
          data={selectorData}
          selectedId={effectiveFixtureId}
          onSelect={setFixtureId}
        />
        {mod.edge.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              {mod.edgeGroupLabel}
            </div>
            <PlayerSelector
              label={`${mod.selectorLabel} — ${mod.edgeGroupLabel.toLowerCase()}`}
              fixtures={mod.edge}
              data={selectorData}
              selectedId={effectiveFixtureId}
              onSelect={setFixtureId}
            />
          </div>
        )}
      </SectionCard>

      {!result.ok ? (
        <ErrorState message={result.message} />
      ) : (
        <>
          {/* 4) Player summary */}
          <PlayerSummaryHeader view={result.view} />

          {/* 5) Position-specific projection summary */}
          {result.projection}

          {/* 6) Horizon selector */}
          <SectionCard title="Horizon">
            <HorizonSelector selected={horizon} onSelect={setHorizon} />
            <p className="mt-2 text-[11px] text-text-muted">
              The horizon changes which factors the model emphasizes and how the drivers below are
              ranked. Weekly and Rest-of-Season include fantasy-point projections; longer horizons
              summarize the component profile only.
            </p>
          </SectionCard>

          {/* 7) Horizon context */}
          <HorizonContext view={result.view} />

          {/* 8) Component profile */}
          <ComponentProfile view={result.view} />

          {/* 9) Explanation drivers */}
          <DriverSections view={result.view} />

          {/* 10) Confidence & volatility */}
          <ConfidenceVolatilityPanel view={result.view} />

          {/* 11) Fallback details */}
          <FallbackPanel view={result.view} />

          {/* 12) Model transparency */}
          <ModelTransparencyFooter view={result.view} />
        </>
      )}
    </div>
  );
}
