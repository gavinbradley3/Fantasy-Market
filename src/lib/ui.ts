import { hashString } from '@/lib/prng';

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// A deterministic team-color-INSPIRED gradient for player avatars (§15.3). These
// are custom hues seeded from the team code — deliberately NOT exact team marks
// or Pantone colors, to stay clear of NFL trademarks.
export function avatarGradient(seed: string): { from: string; to: string } {
  const h = hashString(seed);
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + ((h >> 8) % 60)) % 360;
  return {
    from: `hsl(${hue1} 45% 32%)`,
    to: `hsl(${hue2} 50% 20%)`,
  };
}

// Movement color token by direction — always paired with an arrow/sign at the
// call site so meaning never depends on color alone (§31).
export function movementColor(n: number): string {
  if (n > 0.05) return 'text-up';
  if (n < -0.05) return 'text-down';
  return 'text-text-muted';
}
