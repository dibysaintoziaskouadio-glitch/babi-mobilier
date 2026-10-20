import type { Config } from 'tailwindcss';

// Charte Babi Mobilier : orange et blanc, cartes très arrondies, boutons « pilule ».
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        orange: {
          50: '#FFF7F0',
          100: '#FFEBDC',
          200: '#FFD3B3',
          300: '#FFB27F',
          400: '#FF8B3D',
          500: '#F2700D',
          600: '#D85F06',
          700: '#B84C06',
          800: '#8F3C08',
          900: '#5E2805',
        },
        encre: '#2A1A0F',
        sable: '#7D6352',
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: { carte: '1.5rem' },
    },
  },
  plugins: [],
};

export default config;
