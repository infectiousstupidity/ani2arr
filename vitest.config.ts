// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { WxtVitest } from 'wxt/testing/vitest-plugin'

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },

      all: false,
      include: ['src/**/*.{ts,tsx,js,jsx}'],
      exclude: [
        'node_modules/**',
        '**/*.d.ts',
        '**/vitest.config.*',
        '**/vite.config.*',
        '**/playwright.config.*',
        '**/wxt.config.*',
        '**/eslint.config.*',
        '**/postcss.config.*',
        '**/tailwind.config.*',
        '**/tsconfig.*',
      ],
    },

    projects: [
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['src/services/tests/**'],
          setupFiles: ['vitest.setup.jsdom.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/services/tests/**'],
          setupFiles: ['vitest.setup.node.ts'],
        },
      },
    ],
  },
})
