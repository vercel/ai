import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9f7',
          100: '#d9efe9',
          500: '#0f8a72',
          600: '#0c7560',
          700: '#0a5f4e',
        },
      },
    },
  },
  plugins: [],
};

export default config;
