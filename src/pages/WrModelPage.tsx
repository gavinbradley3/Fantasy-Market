import PlayerModelPage from '@/pages/player-model/PlayerModelPage';

// Backward-compatible alias for the original /wr-model route. It renders the same
// shared Player Model shell, defaulting to the WR position, so existing bookmarks
// and tests keep working while the experience is now position-flexible.
export default function WrModelPage() {
  return <PlayerModelPage defaultPosition="WR" />;
}
