/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dwellio: {
          teal: '#172B35',   // Deep teal - primary brand & headers
          mint: '#B8D9CF',   // Soft mint - accent, highlights, badges
          ivory: '#F6F4EC',  // Warm ivory - background canvas & cards
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
