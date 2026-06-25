import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'fofus-green':  '#00cc66',
        'fofus-black':  '#080808',
        'fofus-white':  '#f5f5f7',
        'fofus-gray':   '#8e8e93',
        'fofus-blue':   '#4a9eff',
        'fofus-orange': '#ff9800',
        'fofus-red':    '#ff4444',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
