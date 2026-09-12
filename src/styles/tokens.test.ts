import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import tokens from './tokens.json';
import tailwindConfig from '../../tailwind.config.js';

const themeCss = readFileSync(fileURLToPath(new URL('./theme.css', import.meta.url)), 'utf8');

/** Every `--pt-*: value;` declaration in theme.css, lowercased. */
function themeVars(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, name, value] of themeCss.matchAll(/(--pt-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out[name] = value.trim().toLowerCase();
  }
  return out;
}

const twColors = tailwindConfig.theme.extend.colors as Record<string, unknown>;

function tw(path: string): string {
  const value = path
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], twColors);
  return String(value).toLowerCase();
}

// token path in tokens.json → [theme.css variable, tailwind color path]
const COLOR_MAP: [string, string, string][] = [
  ['color.bg.canvas', '--pt-bg-canvas', 'canvas'],
  ['color.bg.surface', '--pt-bg-surface', 'surface'],
  ['color.bg.surfaceElevated', '--pt-bg-surface-elevated', 'elevated'],
  ['color.bg.surfaceSubtle', '--pt-bg-surface-subtle', 'surface-subtle'],
  ['color.border.default', '--pt-border-default', 'border-default'],
  ['color.border.strong', '--pt-border-strong', 'border-strong'],
  ['color.border.focus', '--pt-border-focus', 'border-focus'],
  ['color.text.primary', '--pt-text-primary', 'text-primary'],
  ['color.text.secondary', '--pt-text-secondary', 'text-secondary'],
  ['color.text.muted', '--pt-text-muted', 'text-muted'],
  ['color.text.faint', '--pt-text-faint', 'text-faint'],
  ['color.brand.purple', '--pt-brand-purple', 'brand.purple'],
  ['color.brand.blue', '--pt-brand-blue', 'brand.blue'],
  ['color.brand.cyan', '--pt-brand-cyan', 'brand.cyan'],
  ['color.status.positive', '--pt-positive', 'positive'],
  ['color.status.negative', '--pt-negative', 'negative'],
  ['color.status.warning', '--pt-warning', 'warning'],
  ['color.status.info', '--pt-info', 'info'],
  ['color.position.QB', '--pt-pos-qb', 'pos-qb'],
  ['color.position.RB', '--pt-pos-rb', 'pos-rb'],
  ['color.position.WR', '--pt-pos-wr', 'pos-wr'],
  ['color.position.TE', '--pt-pos-te', 'pos-te'],
];

function token(path: string): string {
  return String(
    path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], tokens),
  ).toLowerCase();
}

describe('brand tokens stay in sync across tokens.json, theme.css and tailwind.config.js', () => {
  const vars = themeVars();

  it.each(COLOR_MAP)('%s', (tokenPath, cssVar, twPath) => {
    const expected = token(tokenPath);
    expect(expected).toMatch(/^#[0-9a-f]{6}$/);
    expect(vars[cssVar], `theme.css ${cssVar}`).toBe(expected);
    expect(tw(twPath), `tailwind ${twPath}`).toBe(expected);
  });

  // Aliases kept for markup that predates the brand kit. They must never drift
  // away from the brand token they stand in for.
  it.each([
    ['base', 'canvas'],
    ['border-subtle', 'border-default'],
    ['up', 'positive'],
    ['down', 'negative'],
  ])('legacy alias %s mirrors %s', (alias, canonical) => {
    expect(tw(alias)).toBe(tw(canonical));
  });

  it('radius and shadow match the brand kit', () => {
    const radius = tailwindConfig.theme.extend.borderRadius as Record<string, string>;
    expect(radius.card).toBe(tokens.radius.md);
    expect(radius.control).toBe(tokens.radius.sm);
    expect(vars['--pt-radius-md']).toBe(tokens.radius.md);
    expect(vars['--pt-radius-sm']).toBe(tokens.radius.sm);

    const shadow = tailwindConfig.theme.extend.boxShadow as Record<string, string>;
    expect(shadow.elevated.replace(/\s/g, '')).toBe(tokens.shadow.elevated.replace(/\s/g, ''));
  });

  it('uses Sora for interface text and Outfit for market data', () => {
    const fonts = tailwindConfig.theme.extend.fontFamily as Record<string, string[]>;
    expect(fonts.ui[0]).toBe('Sora');
    expect(fonts.data[0]).toBe('Outfit');
    // The pre-brand aliases resolve to the same two faces.
    expect(fonts.display[0]).toBe('Sora');
    expect(fonts.body[0]).toBe('Sora');
    expect(fonts.mono[0]).toBe('Outfit');
    expect(vars['--pt-font-ui']).toContain('sora');
    expect(vars['--pt-font-data']).toContain('outfit');
  });
});
