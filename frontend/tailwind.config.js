/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: '#ffffff', muted: '#f6f7f9', strong: '#eef0f3' },
        ink: { DEFAULT: '#0f1115', muted: '#5b6370' },
        accent: { DEFAULT: '#2563eb', hover: '#1d4ed8' },
      },
    },
  },
  plugins: [],
}

