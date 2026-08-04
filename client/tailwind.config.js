/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic names rather than raw palette values, so the meaning of a
        // colour is visible at the call site and changing the palette is one
        // edit rather than a search across every component.
        surface: {
          base: '#0b1120',
          panel: '#111a2e',
          raised: '#182440',
          border: '#22314f',
        },
        role: {
          core: '#38bdf8',
          distribution: '#a78bfa',
          access: '#34d399',
        },
        impact: {
          failed: '#f43f5e',
          isolated: '#fb923c',
          context: '#475569',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
