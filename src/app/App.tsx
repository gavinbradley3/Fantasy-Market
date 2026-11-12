import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/chrome/AppShell';
import BoardPage from '@/pages/BoardPage';
import MethodologyPage from '@/pages/MethodologyPage';
import LegalPage from '@/pages/LegalPage';
import NotFoundPage from '@/pages/NotFoundPage';

/**
 * Former Demo Market routes. They rendered simulated prices, movements, injury notes and
 * buy/sell signals next to real player names, so they are no longer public. Old links land on
 * The Board instead of a 404. The page components and their UI building blocks are kept in the
 * repository for reuse once they can be driven by published values.
 */
export const RETIRED_DEMO_ROUTES = [
  '/market',
  '/player/:ticker',
  '/watchlist',
  '/portfolio',
  '/player-model',
  '/wr-model',
] as const;

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/board" replace />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/methodology" element={<MethodologyPage />} />
        <Route path="/legal" element={<LegalPage />} />
        {RETIRED_DEMO_ROUTES.map((path) => (
          <Route key={path} path={path} element={<Navigate to="/board" replace />} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}
