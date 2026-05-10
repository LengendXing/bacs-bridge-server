/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './src/client/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Apple macOS 风格配色
        surface: {
          light: '#f5f5f7',
          dark: '#1d1d1f',
        },
        accent: {
          DEFAULT: '#6366f1',
          hover: '#4f46e5',
        },
        muted: '#86868b',
        border: {
          light: '#e5e7eb',
          dark: '#2a2a4a',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      borderRadius: {
        'mac': '12px',
        'mac-lg': '16px',
      },
      boxShadow: {
        'mac': '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
        'mac-md': '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
        'mac-lg': '0 8px 32px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.06)',
      },
      backdropBlur: {
        'mac': '20px',
      },
    },
  },
  plugins: [],
};
