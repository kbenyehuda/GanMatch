import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Parenting-friendly, warm palette
        gan: {
          primary: "#2D6A4F",
          secondary: "#40916C",
          accent: "#95D5B2",
          muted: "#B7E4C7",
          dark: "#1B4332",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        hebrew: ["var(--font-assistant)", "Heebo", "sans-serif"],
      },
      // RTL-aware utilities
      "logical": {
        "start": "inline-start",
        "end": "inline-end",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
