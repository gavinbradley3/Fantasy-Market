/** @type {import('tailwindcss').Config} */
// PlayerTicker brand tokens, encoded as the Tailwind theme so the token system is
// enforced in code rather than by convention.
//
// These literal hex values mirror src/styles/tokens.json and src/styles/theme.css.
// They are written out here (rather than read from a CSS variable) so Tailwind can
// parse them and keep opacity modifiers such as `bg-positive/10` working.
// src/styles/tokens.test.ts fails the build if the three files ever drift apart.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces
        canvas: '#0B0F14',
        surface: '#11161D',
        elevated: '#151B23',
        'surface-subtle': '#0F141A',
        // `base` predates the brand kit and is kept as an alias of the canvas so
        // existing markup keeps resolving to the right value.
        base: '#0B0F14',

        // Borders
        'border-default': '#1F2630',
        'border-strong': '#2B3441',
        'border-focus': '#5C6EFF',
        'border-subtle': '#1F2630', // legacy alias of border-default

        // Text
        'text-primary': '#F2F4F7',
        'text-secondary': '#B0B8C4',
        'text-muted': '#8A94A6',
        'text-faint': '#606A78',

        // Brand — identifies PlayerTicker itself, never player performance.
        brand: {
          purple: '#7B61FF',
          blue: '#3882F6',
          cyan: '#4CC9F0',
        },
        // Legacy accent alias; prefer `brand-purple` / `brand-blue` in new markup.
        secondary: '#7B61FF',

        // Market status — reserved for value direction and state.
        positive: '#3ED598',
        negative: '#FF6B6B',
        warning: '#F5B942',
        info: '#5BA8FF',
        up: '#3ED598', // legacy alias of positive
        down: '#FF6B6B', // legacy alias of negative

        // Position glyph hues (low chroma by design — see theme.css).
        'pos-qb': '#8193C4',
        'pos-rb': '#C2A06B',
        'pos-wr': '#63AEB4',
        'pos-te': '#A995D6',
      },
      fontFamily: {
        // Sora carries interface language; Outfit carries market data.
        ui: ['Sora', 'system-ui', 'sans-serif'],
        data: ['Outfit', 'Sora', 'system-ui', 'sans-serif'],
        display: ['Sora', 'system-ui', 'sans-serif'],
        body: ['Sora', 'system-ui', 'sans-serif'],
        // `font-mono` predates the brand kit and marked numeric data; it now
        // resolves to the data face so those call sites stay correct.
        mono: ['Outfit', 'Sora', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': '0.75rem',
        micro: ['0.6875rem', { lineHeight: '1.25', fontWeight: '600' }],
        'data-xl': ['1.75rem', { lineHeight: '1' }],
        'data-lg': ['1.125rem', { lineHeight: '1.1' }],
      },
      borderRadius: {
        sm: '8px',
        control: '8px',
        card: '12px',
        panel: '12px',
      },
      boxShadow: {
        elevated: '0 12px 32px rgba(0,0,0,.32)',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: {
        DEFAULT: '140ms',
      },
      maxWidth: {
        app: '1440px',
      },
    },
  },
  plugins: [],
};
