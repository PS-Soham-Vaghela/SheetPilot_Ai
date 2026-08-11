import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true, rewrite: p => p.replace(/^\/api/, '') },
      '/auth': 'http://localhost:8000',
      '/me': 'http://localhost:8000',
      '/dashboard': 'http://localhost:8000',
      '/workbooks': 'http://localhost:8000',
      '/history': 'http://localhost:8000',
      '/analyze': 'http://localhost:8000',
      '/analyze-url': 'http://localhost:8000',
      '/commit': 'http://localhost:8000',
      '/undo': 'http://localhost:8000',
      '/schema': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    }
  },
  build: { outDir: 'dist', sourcemap: false }
})
