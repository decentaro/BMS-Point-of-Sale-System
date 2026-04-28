import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/frontend'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/frontend/__tests__/setup.ts'],
    include: ['src/frontend/__tests__/**/*.test.ts', 'src/frontend/__tests__/**/*.test.tsx'],
    coverage: {
      include: [
        'src/frontend/utils/**',
        'src/frontend/contexts/**',
        'src/frontend/config/**',
        'src/frontend/components/**',
      ],
      exclude: [
        'src/frontend/components/ui/**',   // shadcn primitives, not authored here
      ],
    },
  },
})
