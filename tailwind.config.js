/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dj: {
          bg: '#090d16',
          card: '#111827',
          surface: '#182234',
          border: '#23324d',
          cyan: '#06b6d4',
          purple: '#a855f7',
          pink: '#ec4899',
          green: '#10b981',
          amber: '#f59e0b',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-cyan': '0 0 20px -5px rgba(6, 182, 212, 0.5)',
        'glow-purple': '0 0 20px -5px rgba(168, 85, 247, 0.5)',
      }
    },
  },
  plugins: [],
}
