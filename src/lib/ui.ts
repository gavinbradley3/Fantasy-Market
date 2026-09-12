import { hashString } from '@/lib/prng';

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// A deterministic tint for player avatars, seeded from the team code — deliberately
// NOT exact team marks or Pantone colors, to stay clear of NFL trademarks.
//
// Saturation is held very low on purpose. A board is a hundred of these at once, so
// a vivid per-player hue would turn the densest surface in the product into confetti
// and pull attention off the player names. These read as charcoal with a hint of
// direction: enough to help the eye track a row, not enough to compete.
export function avatarGradient(seed: string): { from: string; to: string } {
  const h = hashString(seed);
  const hue = h % 360;
  return {
    from: `hsl(${hue} 14% 24%)`,
    to: `hsl(${hue} 16% 17%)`,
  };
}

// Movement color token by direction — always paired with an arrow/sign at the
// call site so meaning never depends on color alone (§31).
export function movementColor(n: number): string {
  if (n > 0.05) return 'text-positive';
  if (n < -0.05) return 'text-negative';
  return 'text-text-muted';
}
