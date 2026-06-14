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
        background: "var(--background)",
        foreground: "var(--foreground)",
        casa: {
          dark: "#0D0D1A",
          cream: "#FFFEF7",
          gold: "#D4A017",
          goldLight: "#FFE082",
          red: "#C41E3A",
          taupe: "#8A7A5A",
          sand: "#E0C8A0",
          card: "rgba(255,255,255,0.03)",
          border: "rgba(255,255,255,0.06)",
        },
      },
      fontFamily: {
        serif: ["var(--font-playfair)", "Georgia", "serif"],
        sans: ["var(--font-nunito)", "system-ui", "sans-serif"],
      },
      animation: {
        breathe: "breathe 3s ease-in-out infinite",
        "pulse-fast": "pulseFast 1s ease-in-out infinite",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.6" },
          "50%": { transform: "scale(1.05)", opacity: "1" },
        },
        pulseFast: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.7" },
          "50%": { transform: "scale(1.1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
