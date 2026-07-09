/** @type {import('tailwindcss').Config} */
// Design tokens from DESIGN.md §21 encoded as the Tailwind theme so the token
// system is enforced in code, not by convention.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0A0E1A',
        surface: '#111827',
        elevated: '#1A2333',
        'border-subtle': '#232D42',
        up: '#2DD4A7',
        down: '#F0526A',
        secondary: '#7C8CF8',
        warning: '#F5B34D',
        'text-primary': '#EDF1F7',
        'text-secondary': '#95A1B8',
        'text-muted': '#5C6880',
        // Position glyph hues (§21.4), desaturated.
        'pos-qb': '#6B8AB0',
        'pos-rb': '#C9A15E',
        'pos-wr': '#4FB8A0',
        'pos-te': '#9B8AD6',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': '0.75rem',
      },
      borderRadius: {
        card: '10px',
        control: '8px',
      },
      boxShadow: {
        elevated: '0 4px 24px rgb(0 0 0 / 0.35)',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      maxWidth: {
        app: '1200px',
      },
    },
  },
  plugins: [],
};
