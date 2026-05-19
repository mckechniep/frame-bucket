import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/__tests__/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Next.js bundlers resolve `'server-only'` via the `react-server` export
      // condition (→ empty.js, no-op). Vitest in Node uses the default condition
      // which loads index.js, which throws unconditionally. Aliasing here gives
      // tests the same no-op resolution Next.js applies in real RSC builds, so
      // server-only-tainted modules can be transitively imported by unit tests
      // without bringing in the runtime guard. Production behavior unchanged.
      'server-only': path.resolve(__dirname, './node_modules/server-only/empty.js'),
    },
  },
});
