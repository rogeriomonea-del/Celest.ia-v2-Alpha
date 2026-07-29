import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Design system Celestia Flights: tema claro slate + marca indigo/violet
        background: "#f8fafc",
        surface: {
          DEFAULT: "#ffffff",
          raised: "#f8fafc",
          overlay: "#ffffff",
        },
        border: "#e2e8f0",
        input: "#cbd5e1",
        ring: "#4f46e5",
        foreground: "#0f172a",
        muted: {
          DEFAULT: "#f1f5f9",
          foreground: "#64748b",
        },
        primary: {
          DEFAULT: "#4f46e5",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#eef2ff",
          foreground: "#4338ca",
        },
        destructive: {
          DEFAULT: "#e11d48",
          foreground: "#fff1f2",
        },
        accent: {
          DEFAULT: "#eef2ff",
          foreground: "#312e81",
        },
        card: {
          DEFAULT: "#ffffff",
          foreground: "#0f172a",
        },
        popover: {
          DEFAULT: "#ffffff",
          foreground: "#0f172a",
        },
        profit: "#059669",
        loss: "#e11d48",
        chart: {
          "1": "#4f46e5",
          "2": "#d97706",
          "3": "#7c3aed",
          "4": "#0891b2",
          "5": "#e11d48",
          "6": "#059669",
        },
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        pop: {
          "0%": { opacity: "0", transform: "translateY(6px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in-up": "fade-in-up 0.35s ease-out both",
        "fade-in": "fade-in 0.3s ease-out both",
        shimmer: "shimmer 1.6s linear infinite",
        "pulse-dot": "pulse-dot 1.2s ease-in-out infinite",
        pop: "pop 0.16s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
