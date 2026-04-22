import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#171b1f",
        foreground: "#b5bfc7",
        surface: "#202429",
        border: "#35383c",
        primary: "#df5f6f",
        cyan: "#00b5bc",
        amber: "#de8f57",
        danger: "#de3b3d",
        secondaryText: "#8e99a3",
        mutedText: "#6c7378",
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "sans-serif"],
        display: ["Bricolage Grotesque", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        glass: "0 18px 40px rgba(0, 0, 0, 0.42)",
        emerald: "0 0 0 1px rgba(223,95,111,0.32), 0 0 28px rgba(223,95,111,0.18)",
        cyan: "0 0 0 1px rgba(0,181,188,0.24), 0 0 22px rgba(0,181,188,0.2)",
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.8" },
          "50%": { transform: "scale(1.08)", opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        bounceSoft: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
      },
      animation: {
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        "bounce-soft": "bounceSoft 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
