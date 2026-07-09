import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="font-mono text-5xl font-bold text-text-muted">404</p>
      <h1 className="mt-3 text-xl text-text-primary">This page isn't on the board.</h1>
      <p className="mt-1 text-sm text-text-secondary">The page you're looking for doesn't exist.</p>
      <Link to="/market" className="mt-5 rounded-control bg-up px-4 py-2 text-sm font-semibold text-base transition hover:brightness-110">
        Go to the Market
      </Link>
    </div>
  );
}
