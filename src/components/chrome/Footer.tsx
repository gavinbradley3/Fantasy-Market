import { Link } from 'react-router-dom';
import { ValueDisclaimer } from '@/components/chrome/Honesty';

export function Footer() {
  return (
    <footer className="mt-10 border-t border-border-subtle pt-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-secondary">
        <Link to="/methodology" className="hover:text-text-primary">Methodology</Link>
        <Link to="/legal" className="hover:text-text-primary">Legal & disclaimers</Link>
        <Link to="/board" className="hover:text-text-primary">The Board</Link>
        <span className="text-text-muted">Player names & stats used factually; no NFL marks or licensed images.</span>
      </div>
      <ValueDisclaimer className="mt-3 max-w-2xl" />
    </footer>
  );
}
