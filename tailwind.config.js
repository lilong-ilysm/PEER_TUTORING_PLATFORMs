/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep slate-teal. primary-600 and above clear 4.5:1 on white (AC-36).
        primary: {
          50: '#eef7f7',
          100: '#d3ebeb',
          200: '#a8d6d7',
          300: '#74babc',
          400: '#489a9d',
          500: '#2d7d80',
          600: '#0f5d5e',
          700: '#0c4a4b',
          800: '#0a3c3d',
          900: '#082e2f',
        },
        // Warm slate neutrals so long reading does not feel clinical.
        ink: {
          50: '#f8f9fa',
          100: '#f1f3f4',
          200: '#e4e7e9',
          300: '#cbd1d5',
          400: '#9aa4ab',
          500: '#6b7680',
          600: '#4d565e',
          700: '#3a4249',
          800: '#252b30',
          900: '#14181b',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.6' }],
        lg: ['1.125rem', { lineHeight: '1.6' }],
        xl: ['1.25rem', { lineHeight: '1.4' }],
        '2xl': ['1.5rem', { lineHeight: '1.25' }],
        '3xl': ['1.875rem', { lineHeight: '1.2' }],
        '4xl': ['2.25rem', { lineHeight: '1.15' }],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        lg: '0.5rem',
        xl: '0.75rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(20 24 27 / 0.04)',
        pop: '0 10px 30px -10px rgb(20 24 27 / 0.18)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-up': 'slide-up 180ms ease-out',
      },
    },
  },
  plugins: [],
};
