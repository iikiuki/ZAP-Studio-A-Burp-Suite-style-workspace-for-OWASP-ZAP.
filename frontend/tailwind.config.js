/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0a0c10",
          900: "#0e1116",
          850: "#12151c",
          800: "#171b23",
          750: "#1c212b",
          700: "#232936",
          600: "#2f3745",
          500: "#3d4759",
        },
        brand: {
          400: "#ff8f4d",
          500: "#ff6b1a",
          600: "#e8540a",
        },
        accent: {
          400: "#4dd0e1",
          500: "#22b8cf",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Menlo", "Consolas", "monospace"],
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      fontSize: { "2xs": ["0.6875rem", "1rem"] },
      keyframes: {
        "pulse-soft": { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.35" } },
      },
      animation: { "pulse-soft": "pulse-soft 1.4s ease-in-out infinite" },
    },
  },
  plugins: [],
};
