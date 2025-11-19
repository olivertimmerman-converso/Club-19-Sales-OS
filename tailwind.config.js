/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ["Playfair Display", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        // Club 19 Core Palette
        club19: {
          black: "#000000",
          platinum: "#E8E8E8",
          silver: "#C0C0C0",
          "silver-dark": "#A8A8A8",
          charcoal: "#333333",
          "off-white": "#FAFAFA",
          gold: "#D4AF37", // Subtle accent only
        },
        // Semantic colors mapped to Club 19 palette
        primary: {
          DEFAULT: "#000000",
          50: "#FAFAFA",
          100: "#F5F5F5",
          200: "#E8E8E8",
          300: "#D1D1D1",
          400: "#A8A8A8",
          500: "#808080",
          600: "#333333",
          700: "#1A1A1A",
          800: "#0D0D0D",
          900: "#000000",
        },
        success: "#000000",
        warning: "#333333",
        error: "#000000",
        info: "#000000",
        border: "#E8E8E8",
        background: "#FFFFFF",
        foreground: "#000000",
      },
      letterSpacing: {
        "luxury": "0.05em",
        "wide": "0.1em",
      },
      borderWidth: {
        "1": "1px",
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in-up': 'fadeInUp 0.5s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeInUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
