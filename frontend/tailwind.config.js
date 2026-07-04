/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        espresso: {
          light: '#2d2722',
          DEFAULT: '#1a1714',
          deep: '#141210',
          darkest: '#0f0e0d',
        },
        brand: {
          orange: '#f97316',
          emerald: '#10b981',
          rose: '#f43f5e',
          blue: '#3b82f6',
        }
      },
    },
  },
  plugins: [],
}
