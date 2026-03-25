import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#171513",
        sand: "#f6f0df",
        ember: "#bf5a36",
        moss: "#6b7a45",
        gold: "#d6ab67"
      },
      boxShadow: {
        card: "0 18px 50px rgba(23, 21, 19, 0.12)"
      },
      fontFamily: {
        display: [
          "var(--font-display)",
          "serif"
        ],
        body: [
          "var(--font-body)",
          "system-ui"
        ]
      }
    }
  },
  plugins: []
};

export default config;
