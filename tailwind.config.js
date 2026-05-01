/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1200px' },
    },
    extend: {
      fontFamily: {
        heading: ["'Boogaloo'", 'cursive'],
        body: ["'DM Sans'", 'sans-serif'],
        mono: ["'Space Mono'", 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--success-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        brutal: '4px 4px 0px 0px hsl(var(--foreground))',
        'brutal-sm': '2px 2px 0px 0px hsl(var(--foreground))',
        'brutal-lg': '6px 6px 0px 0px hsl(var(--foreground))',
      },
      keyframes: {
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'bounce-in': {
          '0%': { transform: 'scale(0.3)', opacity: '0' },
          '50%': { transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 5px hsl(var(--destructive))' },
          '50%': { boxShadow: '0 0 20px hsl(var(--destructive)), 0 0 30px hsl(var(--destructive) / 0.5)' },
        },
        'pulse-glow-primary': {
          '0%, 100%': { boxShadow: '0 0 5px hsl(var(--primary))' },
          '50%': { boxShadow: '0 0 20px hsl(var(--primary)), 0 0 30px hsl(var(--primary) / 0.5)' },
        },
        confetti: {
          '0%': { transform: 'translateY(0) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(-200px) rotate(720deg)', opacity: '0' },
        },
      },
      animation: {
        'spin-slow': 'spin-slow 4s linear infinite',
        'bounce-in': 'bounce-in 0.5s ease-out',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'pulse-glow-primary': 'pulse-glow-primary 2s ease-in-out infinite',
        confetti: 'confetti 1s ease-out forwards',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
