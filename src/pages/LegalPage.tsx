import { Link } from 'react-router-dom';
import { Footer } from '@/components/chrome/Footer';

export default function LegalPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-text-primary">Legal & Disclaimers</h1>

      <Section title="Fictional value">
        Market prices on PlayerTicker are fictional fantasy value indexes. They are not real money,
        not securities, and not tradable instruments. Nothing on this site can be bought, sold, or
        wagered.
      </Section>

      <Section title="Not advice, not gambling">
        PlayerTicker provides fantasy sports entertainment information only. It is not financial
        advice, investment advice, gambling, or betting, and offers nothing of monetary value to buy,
        sell, or wager. "Buy" and "Sell" are used only as fantasy roster-move shorthand.
      </Section>

      <Section title="Names, statistics & imagery">
        Player names and public statistics are used factually, as is standard in the fantasy sports
        industry, with no implied endorsement. The MVP uses no NFL team logos, wordmarks, uniforms, or
        licensed player headshots. Player avatars are generated initials on custom, team-color-inspired
        gradients — not official marks. Team names appear as plain text.
      </Section>

      <Section title="Demo data">
        During the MVP, all values are simulated by our market engine from authored inputs. No live or
        licensed data source is connected. See the{' '}
        <Link to="/methodology" className="text-secondary hover:underline">Methodology</Link> page for the
        full explanation of what is simulated.
      </Section>

      <Section title="Privacy">
        The MVP collects nothing beyond anonymous usage analytics and local-storage state (your
        watchlist and portfolio never leave your browser). There are no accounts and no sale of user
        data.
      </Section>

      <Footer />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border-subtle bg-surface p-4">
      <h2 className="mb-2 text-base font-semibold text-text-primary">{title}</h2>
      <p className="text-sm leading-relaxed text-text-secondary">{children}</p>
    </section>
  );
}
