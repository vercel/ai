import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
        },
        navy: {
          800: '#16213e',
          900: '#0f1729',
          950: '#0b101e',
        },
        ink: {
          DEFAULT: '#0A0A0A',
          800: '#121212',
          700: '#1A1A1A',
        },
        electric: {
          DEFAULT: '#007BFF',
          400: '#3B9DFF',
          500: '#007BFF',
          600: '#0062CC',
        },
      },
      boxShadow: {
        glow: '0 0 40px -8px rgba(0, 123, 255, 0.55)',
      },
    },
  },
  plugins: [],
};

export default config;
