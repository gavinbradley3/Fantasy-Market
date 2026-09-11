import { Link } from 'react-router-dom';
import { ValueDisclaimer } from '@/components/chrome/Honesty';

export function Footer() {
  return (
    <footer className="mt-12 border-t border-border-default pt-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted">
        <Link to="/methodology" className="font-medium text-text-secondary transition-colors duration-standard hover:text-text-primary">Methodology</Link>
        <Link to="/legal" className="font-medium text-text-secondary transition-colors duration-standard hover:text-text-primary">Legal & disclaimers</Link>
        <Link to="/board" className="font-medium text-text-secondary transition-colors duration-standard hover:text-text-primary">The Board</Link>
        <span>Player names & stats used factually; no NFL marks or licensed images.</span>
      </div>
      <ValueDisclaimer className="mt-3 max-w-2xl" />
    </footer>
  );
}
