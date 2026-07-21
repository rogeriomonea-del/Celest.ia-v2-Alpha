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

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink,
        gold,
        pine,
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
      },
      animation: {
        pop: 'pop 0.16s ease-out',
        'fade-up': 'fade-up 0.35s ease-out both',
      },
    },
  },
  plugins: [],
}
