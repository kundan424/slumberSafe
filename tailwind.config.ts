import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#09090b",
        surface: "#121217",
        oled: "#030305",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "wave-1": "wave 1.2s ease-in-out infinite alternate",
        "wave-2": "wave 1.5s ease-in-out infinite alternate 0.2s",
        "wave-3": "wave 1.1s ease-in-out infinite alternate 0.4s",
        "wave-4": "wave 1.4s ease-in-out infinite alternate 0.1s",
        "glow-breathe": "breathe 3s ease-in-out infinite",
      },
      keyframes: {
        wave: {
          "0%": { height: "12px", opacity: "0.4" },
          "100%": { height: "48px", opacity: "1" },
        },
        breathe: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.8" },
          "50%": { transform: "scale(1.08)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
