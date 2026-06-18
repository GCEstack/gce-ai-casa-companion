import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0f",
        surface: "#13131f",
        panel: "#1c1c2e",
        neon: {
          pink: "#ff2a6d",
          cyan: "#05d9e8",
          green: "#00ff9f",
          yellow: "#f7ff58",
        },
      },
      animation: {
        pulseFast: "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        glow: "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px #05d9e8" },
          "100%": { boxShadow: "0 0 20px #ff2a6d" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
