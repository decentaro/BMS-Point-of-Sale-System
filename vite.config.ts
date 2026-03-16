import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  root: './src/frontend',
  base: './',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/frontend'),
    },
  },
  server: {
    port: 3001,
    strictPort: true,
    open: false,  // Prevent browser from opening automatically
    host: '127.0.0.1',  // Explicit IPv4 — avoids localhost resolving to ::1 on Linux
    watch: {
      ignored: [
        '**/BMS_POS_API/logs/**',
        '**/logs/**',
        '**/*.log'
      ]
    }
  },
})