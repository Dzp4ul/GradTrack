/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        'background-soft': 'var(--background-soft)',
        surface: 'var(--surface)',
        'surface-alt': 'var(--surface-alt)',
        'surface-muted': 'var(--surface-muted)',
        'surface-hover': 'var(--surface-hover)',
        input: 'var(--input)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
      },
    },
  },
  plugins: [],
};
