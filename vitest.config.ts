// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'node',
    globals: false,

    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.output/**',
      '**/.wxt/**',
      '**/coverage/**',
    ],

    setupFiles: ['./vitest.setup.ts'],

    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,

    passWithNoTests: false,
  },
});
