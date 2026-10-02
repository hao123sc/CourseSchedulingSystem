/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#4F46E5',
          50: '#EEF2FF',
          100: '#E0E7FF',
          600: '#4F46E5',
          700: '#4338CA'
        },
        subject: {
          chinese: { bg: '#FEF2F2', text: '#B91C1C', accent: '#EF4444' },
          math: { bg: '#EEF2FF', text: '#4338CA', accent: '#6366F1' },
          english: { bg: '#ECFDF5', text: '#047857', accent: '#10B981' },
          physics: { bg: '#EFF6FF', text: '#1D4ED8', accent: '#3B82F6' },
          chemistry: { bg: '#FFFBEB', text: '#B45309', accent: '#F59E0B' },
          biology: { bg: '#F7FEE7', text: '#4D7C0F', accent: '#84CC16' },
          politics: { bg: '#FAF5FF', text: '#7E22CE', accent: '#A855F7' },
          history: { bg: '#FEF3C7', text: '#92400E', accent: '#D97706' },
          geography: { bg: '#F0FDFA', text: '#0F766E', accent: '#14B8A6' },
          pe: { bg: '#FFF7ED', text: '#C2410C', accent: '#F97316' },
          music: { bg: '#FDF2F8', text: '#BE185D', accent: '#EC4899' },
          art: { bg: '#FDF4FF', text: '#A21CAF', accent: '#D946EF' },
          it: { bg: '#F8FAFC', text: '#475569', accent: '#64748B' }
        }
      },
      fontFamily: {
        sans: [
          'Inter',
          'HarmonyOS Sans SC',
          'PingFang SC',
          'Microsoft YaHei UI',
          'system-ui',
          'sans-serif'
        ]
      },
      borderRadius: {
        card: '12px',
        lesson: '8px',
        btn: '8px',
        input: '6px'
      },
      boxShadow: {
        sm: '0 1px 2px rgba(15,23,42,.06)',
        md: '0 4px 12px rgba(15,23,42,.10)',
        lg: '0 12px 24px rgba(15,23,42,.18)'
      },
      transitionTimingFunction: {
        std: 'cubic-bezier(.4,0,.2,1)'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
