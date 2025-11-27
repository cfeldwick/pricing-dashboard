/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'trader-bg': '#1a1a2e',
        'trader-panel': '#16213e',
        'trader-border': '#0f3460',
        'trader-accent': '#e94560',
        'trader-text': '#eaeaea',
        'trader-muted': '#8b8b8b',
        'price-up': '#00c853',
        'price-down': '#ff5252',
      },
      fontSize: {
        'xxs': '0.65rem',
      },
    },
  },
  plugins: [],
}
