import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="mt-12 border-t border-border-default pt-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted">
        <Link to="/board" className="font-medium text-text-secondary transition-colors duration-standard hover:text-text-primary">The Board</Link>
        <Link to="/methodology" className="font-medium text-text-secondary transition-colors duration-standard hover:text-text-primary">Methodology</Link>
        <Link to="/legal" className="font-medium text-text-secondary transition-colors duration-standard hover:text-text-primary">Legal & data credits</Link>
        <span>Player names & stats used factually; no NFL marks or licensed images.</span>
      </div>
      <p className="mt-3 max-w-2xl text-[11px] leading-relaxed text-text-muted">
        PlayerTicker values are fantasy football rankings in beta, not predictions with a proven track record. They are
        entertainment information only — not financial advice, investment advice, gambling or betting.
      </p>
    </footer>
  );
}
