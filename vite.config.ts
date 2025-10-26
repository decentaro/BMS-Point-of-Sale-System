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
    host: 'localhost',  // Explicitly set host
    watch: {
      ignored: [
        '**/BMS_POS_API/logs/**',
        '**/logs/**',
        '**/*.log'
      ]
    }
  },
})