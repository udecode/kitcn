import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'better-convex/aggregate': path.resolve(
        import.meta.dirname,
        'packages/better-convex/src/aggregate/index.ts'
      ),
      'better-convex/orm': path.resolve(
        import.meta.dirname,
        'packages/better-convex/src/orm/index.ts'
      ),
    },
  },
  test: {
    environment: 'edge-runtime',
    // Inline monorepo deps so Vite applies our source aliases (avoid loading dist/* from package exports).
    server: { deps: { inline: ['convex-test', 'better-convex'] } },
    include: [
      'convex/**/*.test.ts',
      'convex/**/*.test.tsx',
      'packages/**/*.vitest.ts',
      'packages/**/*.vitest.tsx',
    ],
    exclude: ['**/node_modules/**', '**/tmp/**'],
  },
});
