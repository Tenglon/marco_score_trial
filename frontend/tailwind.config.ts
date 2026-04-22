import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        parchment: "hsl(var(--parchment) / <alpha-value>)",
        "parchment-deep": "hsl(var(--parchment-deep) / <alpha-value>)",
        ink: "hsl(var(--ink) / <alpha-value>)",
        "ink-soft": "hsl(var(--ink-soft) / <alpha-value>)",
        muted: "hsl(var(--muted) / <alpha-value>)",
        rule: "hsl(var(--rule) / <alpha-value>)",
        brick: "hsl(var(--brick) / <alpha-value>)",
        "brick-soft": "hsl(var(--brick-soft) / <alpha-value>)",
        ochre: "hsl(var(--ochre) / <alpha-value>)",
        forest: "hsl(var(--forest) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-body)", "Helvetica Neue", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        archive: "0.18em",
      },
    },
  },
  plugins: [],
};
export default config;
