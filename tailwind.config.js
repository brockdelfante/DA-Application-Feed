/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0d0d1a',
          800: '#1a1a2e',
          700: '#16213e',
          600: '#0f3460',
          500: '#533483'
        },
        accent: {
          purple: '#7c3aed',
          blue: '#2563eb',
          cyan: '#06b6d4',
          green: '#10b981',
          pink: '#ec4899',
          orange: '#f97316'
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'gradient': 'gradient 6s ease infinite',
        'waveform': 'waveform 1.5s ease-in-out infinite'
      },
      keyframes: {
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' }
        },
        waveform: {
          '0%, 100%': { transform: 'scaleY(1)' },
          '50%': { transform: 'scaleY(1.5)' }
        }
      }
    }
  },
  plugins: []
};
