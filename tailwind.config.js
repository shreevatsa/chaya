/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./annotator.html",
    "./viewer.html",
    "./test.html", 
    "./src/**/*.{js,ts,jsx,tsx}",
    "./dist/**/*.js"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
