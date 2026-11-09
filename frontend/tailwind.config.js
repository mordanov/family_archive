const v = (name) => `rgb(var(${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: v('--canvas'),
        surface: { DEFAULT: v('--surface'), muted: v('--surface-muted'), strong: v('--surface-strong') },
        ink: { DEFAULT: v('--ink'), muted: v('--ink-muted') },
        accent: { DEFAULT: v('--accent'), hover: v('--accent-hover') },
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / .04), 0 1px 3px rgb(0 0 0 / .06)',
        lift: '0 8px 24px -6px rgb(0 0 0 / .18)',
      },
      borderRadius: { xl2: '1rem' },
      keyframes: {
        pop: { from: { opacity: 0, transform: 'translateY(8px) scale(.98)' }, to: { opacity: 1, transform: 'none' } },
        fade: { from: { opacity: 0 }, to: { opacity: 1 } },
      },
      animation: { pop: 'pop .18s ease-out', fade: 'fade .15s ease-out' },
    },
  },
  plugins: [],
}
