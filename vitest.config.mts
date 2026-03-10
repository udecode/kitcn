import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'better-convex/aggregate': path.resolve(
        import.meta.dirname,
        'packages/better-convex/src/aggregate/index.ts'
      ),
      'better-convex/auth': path.resolve(
        import.meta.dirname,
        'packages/better-convex/src/auth/index.ts'
      ),
      'better-convex/auth/config': path.resolve(
        import.meta.dirname,
        'packages/better-convex/src/auth-config/index.ts'
      ),
      'better-convex/auth/http': path.resolve(
        import.meta.dirname,
        'packages/better-convex/src/auth-http/index.ts'
      ),
      'better-convex/crpc': path.resolve(
        import.meta.dirname,
        'packages/better-convex/src/crpc/index.ts'
      ),
      'better-convex/orm': path.resolve(
        import.meta.dirname,
        'packages/better-convex/src/orm/index.ts'
      ),
      'better-convex/ratelimit': path.resolve(
        import.meta.dirname,
        'packages/better-convex/src/ratelimit/index.ts'
      ),
      'better-convex/server': path.resolve(
        import.meta.dirname,
        'packages/better-convex/src/server/index.ts'
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
