import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sonare: {
          black: "#000000",
          ink: "#141414",
          white: "#FFFFFF",
          silver: "#CBCBCB",
          gold: "#CF9F52",
        },
      },
      fontFamily: {
        display: ["Grandis Extended", "Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
