import type { Config } from "tailwindcss";

/**
 * Dark broadcast aesthetic. The palette + fonts match crossover.html:
 *  - near-black "court night" background with a warm stadium glow,
 *  - hardwood-amber primary accent,
 *  - cool blue for college links, amber for team links (functional coding),
 *  - Bebas Neue (scoreboard display) + Barlow Condensed (names/UI).
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        court: {
          black: "#0a0a0c",
          panel: "#141318",
          line: "#2a2730",
        },
        amber: {
          hard: "#f0a437", // hardwood-amber primary
          glow: "#ffb84d",
        },
        college: {
          DEFAULT: "#5aa9e6", // cool blue
          dim: "#2c4a63",
        },
        team: {
          DEFAULT: "#f0a437", // amber
          dim: "#5e451c",
        },
      },
      fontFamily: {
        display: ["var(--font-bebas)", "Impact", "sans-serif"],
        condensed: ["var(--font-barlow)", "system-ui", "sans-serif"],
      },
      keyframes: {
        "pop-in": {
          "0%": { transform: "scale(0.92) translateY(8px)", opacity: "0" },
          "60%": { transform: "scale(1.02)", opacity: "1" },
          "100%": { transform: "scale(1) translateY(0)", opacity: "1" },
        },
        "draw-line": {
          "0%": { transform: "scaleY(0)", opacity: "0" },
          "100%": { transform: "scaleY(1)", opacity: "1" },
        },
        shake: {
          "0%,100%": { transform: "translateX(0)" },
          "20%,60%": { transform: "translateX(-7px)" },
          "40%,80%": { transform: "translateX(7px)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pop-in": "pop-in 0.34s cubic-bezier(0.22,1,0.36,1) both",
        "draw-line": "draw-line 0.3s ease-out both",
        shake: "shake 0.4s ease-in-out",
        "fade-up": "fade-up 0.4s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
