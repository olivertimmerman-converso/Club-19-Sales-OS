/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-cormorant)", "Cormorant Garamond", "Georgia", "serif"],
        sans: ["var(--font-montserrat)", "Montserrat", "system-ui", "sans-serif"],
      },
      colors: {
        // Club 19 Brand Palette
        club19: {
          navy: "#1c2331",
          "navy-light": "#263044",
          cream: "#f5f0eb",
          taupe: "#a89984",
          "taupe-light": "#c4b5a5",
          warmgrey: "#e8e2db",
          offwhite: "#faf8f5",
          // Legacy aliases (keep for backwards compat in code comments referencing them)
          black: "#1c2331",
          platinum: "#e8e2db",
          silver: "#c4b5a5",
          "silver-dark": "#a89984",
          charcoal: "#263044",
          "off-white": "#faf8f5",
          gold: "#a89984",
        },
        // Semantic palette
        primary: {
          DEFAULT: "#1c2331",
          50: "#faf8f5",
          100: "#f5f0eb",
          200: "#e8e2db",
          300: "#c4b5a5",
          400: "#a89984",
          500: "#6b6b6b",
          600: "#2d2d2d",
          700: "#263044",
          800: "#1c2331",
          900: "#151b27",
        },
        success: "#15803d",
        warning: "#b45309",
        error: "#b91c1c",
        info: "#1d4ed8",
        border: "#e8e2db",
        background: "#faf8f5",
        foreground: "#2d2d2d",
      },
      letterSpacing: {
        luxury: "0.05em",
        wide: "0.1em",
      },
      borderWidth: {
        1: "1px",
      },
      boxShadow: {
        subtle: "0 1px 3px rgba(28,35,49,0.06)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
        "fade-in-up": "fadeInUp 0.5s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "slide-in-left": "slideInLeft 0.25s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeInUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideInLeft: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [],
};
