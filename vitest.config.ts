import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@solver': resolve(__dirname, 'src/solver')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
