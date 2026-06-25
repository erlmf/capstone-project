/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          blue:   '#004996',   // primary
          sky:    '#94CFE5',   // secondary / accent
          cream:  '#FFFFFF',   // background (pure white)
          yellow: '#ECC30B',   // highlight / warning
          orange: '#F37748',   // accent warm
        },
      },
      fontFamily: {
        sans: ['Poppins'],
      },
    },
  },
  plugins: [],
}