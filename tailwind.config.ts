import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "bg-black": "#000000",
        "bg-deep": "#050507",
        "bg-raised": "#07070A",
        "bg-elevated": "#0E0E14",
        "border-subtle": "#1A1A24",
        "border-active": "#2E2A4A",
        "ink-primary": "#FFFFFF",
        "ink-secondary": "#8A8A99",
        "ink-muted": "#4A4A57",
        "ink-faint": "#2A2A33",
        violet: "#A78BFA",
        "violet-2": "#7C3AED",
        blue: "#4F8BFF",
        "blue-2": "#2F6FE3",
        lime: "#B4FF39",
        amber: "#FFB020",
        red: "#FF4D4D"
      },
      fontFamily: {
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"]
      },
      animation: {
        "pulse-soft": "pulseSoft 1.6s ease-in-out infinite",
        "blink": "blink 1s steps(2, start) infinite",
        "drift": "drift 16s ease-in-out infinite alternate",
        "glitch": "glitch 320ms ease-in-out 1"
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" }
        },
        blink: {
          "50%": { opacity: "0" }
        },
        drift: {
          from: { transform: "translate(0,0)" },
          to: { transform: "translate(80px, -40px)" }
        },
        glitch: {
          "0%": { transform: "translate(0,0)", filter: "none" },
          "20%": { transform: "translate(-2px,1px)", filter: "hue-rotate(20deg)" },
          "40%": { transform: "translate(2px,-1px)", filter: "hue-rotate(-20deg)" },
          "60%": { transform: "translate(-1px,0)" },
          "100%": { transform: "translate(0,0)", filter: "none" }
        }
      }
    }
  },
  plugins: []
};

export default config;
