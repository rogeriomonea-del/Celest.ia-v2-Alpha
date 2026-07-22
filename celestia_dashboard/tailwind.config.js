/** @type {import('tailwindcss').Config} */
//
// Sistema de design premium/concierge do celest.ia.
//
// Para virar a identidade inteira sem reescrever cada className, os nomes de cor
// do Tailwind são REMAPEADOS para a paleta premium:
//   slate/gray/neutral -> ink   (grafite quente: fundo, texto, bordas)
//   indigo/violet       -> gold  (dourado sóbrio: destaques, milhas, "melhor opção")
//   emerald/green       -> pine  (esmeralda profunda: voo direto, sucesso, sustentável)
// CTAs em grafite (ink) são aplicados explicitamente nos componentes.
const ink = {
  50: '#f7f5f1',
  100: '#efece5',
  200: '#e3ded3',
  300: '#cbc5b6',
  400: '#a39d8d',
  500: '#726c5d',
  600: '#585345',
  700: '#454136',
  800: '#2c2a23',
  900: '#201e19',
  950: '#141210',
}

const gold = {
  50: '#faf6ec',
  100: '#f1e6cc',
  200: '#e4cd9b',
  300: '#d4b068',
  400: '#c69a43',
  500: '#b8873a',
  600: '#9a6f2d',
  700: '#7c5822',
  800: '#654726',
  900: '#553c25',
}

const pine = {
  50: '#eef6f1',
  100: '#d3e9dd',
  200: '#a8d3bb',
  300: '#72b491',
  400: '#43926c',
  500: '#1f7a54',
  600: '#116a47',
  700: '#0d543a',
  800: '#0c4530',
  900: '#0a3927',
}

const space = {
  50: '#eef8fb',
  100: '#d8f0f5',
  200: '#abdfe9',
  300: '#70c8d7',
  400: '#3babbf',
  500: '#218ca3',
  600: '#1c7085',
  700: '#1b596b',
  800: '#102b3f',
  900: '#071624',
  950: '#020813',
}

const aqua = {
  50: '#effefe',
  100: '#c8fbfa',
  200: '#91f5f4',
  300: '#55e6e6',
  400: '#2fd0d4',
  500: '#16b1b8',
  600: '#108d98',
  700: '#126f79',
  800: '#145962',
  900: '#154a52',
}

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink,
        gold,
        pine,
        space,
        aqua,
        slate: ink,
        gray: ink,
        neutral: ink,
        indigo: gold,
        violet: gold,
        emerald: pine,
        green: pine,
      },
      fontFamily: {
        sans: [
          'Inter Variable',
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
        serif: [
          'Fraunces Variable',
          'Fraunces',
          'ui-serif',
          'Georgia',
          'Cambria',
          'Times New Roman',
          'serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px rgba(32, 30, 25, 0.04), 0 8px 24px -12px rgba(32, 30, 25, 0.18)',
        lift: '0 2px 4px rgba(32, 30, 25, 0.05), 0 18px 40px -18px rgba(32, 30, 25, 0.30)',
        gold: '0 10px 30px -12px rgba(154, 111, 45, 0.45)',
        nebula: '0 28px 90px -32px rgba(1, 8, 20, 0.74)',
        glass: '0 24px 80px -36px rgba(22, 177, 184, 0.38)',
        orbit: '0 0 0 5px rgba(85, 230, 230, 0.08), 0 0 28px rgba(85, 230, 230, 0.62)',
      },
      keyframes: {
        pop: {
          '0%': { opacity: '0', transform: 'translateY(6px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        'orbit-pulse': {
          '0%, 100%': { opacity: '0.45', transform: 'scale(0.96)' },
          '50%': { opacity: '1', transform: 'scale(1.04)' },
        },
        drift: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0)' },
          '50%': { transform: 'translate3d(0, -8px, 0)' },
        },
      },
      animation: {
        pop: 'pop 0.16s ease-out',
        'fade-up': 'fade-up 0.35s ease-out both',
        shimmer: 'shimmer 1.8s linear infinite',
        'orbit-pulse': 'orbit-pulse 3.2s ease-in-out infinite',
        drift: 'drift 7s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
