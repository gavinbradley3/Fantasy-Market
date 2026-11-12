import { Link } from 'react-router-dom';
import { Footer } from '@/components/chrome/Footer';

export default function LegalPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-[26px] font-bold leading-tight text-text-primary">Legal, Disclaimers & Data Credits</h1>

      <Section title="What the values are">
        PlayerTicker values are fantasy football rankings produced by our own models from public statistics. They
        are in beta and have not been shown to predict future fantasy production better than simple alternatives.
        See the <Link to="/methodology" className="text-brand-blue hover:underline">Methodology</Link> page for how
        they are made and what they leave out.
      </Section>

      <Section title="Not advice, not gambling">
        PlayerTicker provides fantasy sports entertainment information only. It is not financial advice, investment
        advice, gambling, or betting, and offers nothing of monetary value to buy, sell, or wager.
      </Section>

      <Section title="Data credits">
        Player, roster, schedule and game statistics come from the{' '}
        <a href="https://github.com/nflverse/nflverse-data" className="text-brand-blue hover:underline">
          nflverse-data
        </a>{' '}
        project, published under the Creative Commons Attribution 4.0 licence. PlayerTicker is not affiliated with
        or endorsed by nflverse, the NFL, or any team. No third-party consensus rankings or market values are shown
        on this site.
      </Section>

      <Section title="Names, statistics & imagery">
        Player names and public statistics are used factually, as is standard in the fantasy sports industry, with
        no implied endorsement. PlayerTicker uses no NFL team logos, wordmarks, uniforms, or licensed player
        headshots. Team names appear as plain text.
      </Section>

      <Section title="Privacy">
        PlayerTicker has no accounts and collects no personal data. Pages are static files; any preferences are
        kept in your own browser.
      </Section>

      <Footer />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border-default bg-surface p-4">
      <h2 className="mb-2 text-base font-semibold text-text-primary">{title}</h2>
      <p className="text-sm leading-relaxed text-text-secondary">{children}</p>
    </section>
  );
}
