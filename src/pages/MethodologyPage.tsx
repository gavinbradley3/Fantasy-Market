// Methodology for the published Board.
//
// This page describes the models that actually produce the values on The Board, including
// what they leave out and how well they have tested. It replaces the Demo Market methodology,
// which described a simulated price engine that is no longer public.

import { Link } from 'react-router-dom';
import { Footer } from '@/components/chrome/Footer';

function Card({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-card border border-border-default bg-surface p-4">
      <h2 className="mb-3 text-lg font-semibold text-text-primary">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-text-secondary">{children}</div>
    </section>
  );
}

export default function MethodologyPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[26px] font-bold leading-tight text-text-primary">Methodology</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          How the values on <Link to="/board" className="text-brand-blue hover:underline">The Board</Link> are
          produced, what they leave out, and how much weight they can bear today.
        </p>
      </header>

      <Card id="status" title="Status: beta, not yet validated">
        <p>
          The Board is a production-based dynasty ranking. We have not yet shown that it predicts future fantasy
          production better than simple alternatives. In back-tests run on 2024 and 2025 data, it ranked players
          about as well as sorting them by last season’s fantasy points, and worse than that at tight end.
        </p>
        <p>
          A validation framework comes next. Until it reports, treat the values as an organised summary of recent
          production, age and role, not as a forecast.
        </p>
      </Card>

      <Card id="data" title="Data">
        <p>
          All inputs come from public nflverse datasets: player identity and biography, weekly rosters, schedules,
          and weekly player box scores. No paid data, no scraped sites, and no third-party consensus rankings are
          used to produce a value.
        </p>
        <p>
          Not used today: routes run, snap counts, red-zone usage, play-level efficiency, injury reports, depth
          charts and contracts. Players who have not yet played an NFL game, including newly drafted rookies, have
          no value.
        </p>
      </Card>

      <Card id="models" title="Models">
        <p>
          <strong>Box-score model</strong> (running backs, receivers, tight ends). Scores per-game volume,
          receiving production, efficiency, scoring, share of team carries and targets, age, durability and draft
          round. Small samples are shrunk toward typical values rather than taken at face value. Its weights are
          authored football judgements, not yet fitted to outcomes.
        </p>
        <p>
          <strong>QB engine</strong> (quarterbacks). Scores passing volume and quality, rushing, role security,
          availability, age and sustainability from career and recent box scores and official starts. Several of
          its declared inputs, such as play-level efficiency, offensive environment and contract status, are not
          available from our data sources and are replaced by documented fallback values. We do not describe it as
          a complete-input model.
        </p>
        <p>
          A player whose evidence is too thin to value shows “—”, never zero or an estimate.
        </p>
      </Card>

      <Card id="value" title="From position scores to one ranking">
        <p>
          Each model scores players within their own position. To rank across positions, PlayerTicker converts each
          player’s position rank into expected fantasy points using production curves measured from 2017–2025
          seasons, then measures how far that sits above a replacement-level starter in a 12-team Superflex,
          full-PPR league. Quarterbacks gain value in Superflex only because the league starts more of them; no
          positional multiplier is applied. The result is normalised to a 0–100 scale. That number is the Value
          column, and the rank is its order.
        </p>
      </Card>

      <Card id="not-shown" title="What is deliberately not shown">
        <ul className="list-disc space-y-1 pl-5">
          <li>Confidence and volatility ratings: they have not been calibrated against real outcomes.</li>
          <li>Prices, daily movements and trading signals: they were simulated and have been removed.</li>
          <li>External market comparisons: withheld until redistribution rights are established.</li>
          <li>Other league formats: only 12-team Superflex, full PPR has a published valuation.</li>
        </ul>
      </Card>

      <Card id="freshness" title="Freshness">
        <p>
          Every board shows when it was published and the date its valuation reflects. A board older than a week is
          flagged; one older than two weeks is marked out of date.
        </p>
      </Card>

      <Footer />
    </div>
  );
}
