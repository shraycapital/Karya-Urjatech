import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copy } from 'vite-plugin-copy'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    copy({
      patterns: [
        { from: 'public', to: '.' }
      ]
    })
  ],
  optimizeDeps: {
    include: ['react', 'react-dom']
  },
  build: {
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  }
})
