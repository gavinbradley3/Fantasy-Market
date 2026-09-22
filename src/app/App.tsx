import { Route, Routes, useLocation, matchPath } from 'react-router-dom';
import ControlledBetaPage from '@/pages/ControlledBetaPage';
import { AppShell } from '@/components/chrome/AppShell';
import LandingPage from '@/pages/LandingPage';
import MarketPage from '@/pages/MarketPage';
import BoardPage from '@/pages/BoardPage';
import PlayerPage from '@/pages/PlayerPage';
import WatchlistPage from '@/pages/WatchlistPage';
import PortfolioPage from '@/pages/PortfolioPage';
import MethodologyPage from '@/pages/MethodologyPage';
import LegalPage from '@/pages/LegalPage';
import WrModelPage from '@/pages/WrModelPage';
import PlayerModelPage from '@/pages/player-model/PlayerModelPage';
import NotFoundPage from '@/pages/NotFoundPage';

export default function App() {
  const {pathname}=useLocation();
  // No production/demo providers are queried by this private diagnostic route.
  if(matchPath({path:'/controlled-beta',end:true},pathname)) return <ControlledBetaPage/>;
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/market" element={<MarketPage />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/player/:ticker" element={<PlayerPage />} />
        <Route path="/watchlist" element={<WatchlistPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/methodology" element={<MethodologyPage />} />
        <Route path="/player-model" element={<PlayerModelPage />} />
        <Route path="/wr-model" element={<WrModelPage />} />
        <Route path="/legal" element={<LegalPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}
