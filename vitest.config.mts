import path from 'node:path';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'kitcn/aggregate': path.resolve(
        import.meta.dirname,
        'packages/kitcn/src/aggregate/index.ts'
      ),
      'kitcn/auth': path.resolve(
        import.meta.dirname,
        'packages/kitcn/src/auth/index.ts'
      ),
      'kitcn/auth/config': path.resolve(
        import.meta.dirname,
        'packages/kitcn/src/auth-config/index.ts'
      ),
      'kitcn/auth/http': path.resolve(
        import.meta.dirname,
        'packages/kitcn/src/auth-http/index.ts'
      ),
      'kitcn/crpc': path.resolve(
        import.meta.dirname,
        'packages/kitcn/src/crpc/index.ts'
      ),
      'kitcn/orm': path.resolve(
        import.meta.dirname,
        'packages/kitcn/src/orm/index.ts'
      ),
      'kitcn/ratelimit': path.resolve(
        import.meta.dirname,
        'packages/kitcn/src/ratelimit/index.ts'
      ),
      'kitcn/server': path.resolve(
        import.meta.dirname,
        'packages/kitcn/src/server/index.ts'
      ),
    },
  },
  test: {
    projects: [
      {
        resolve: {
          alias: {
            'kitcn/aggregate': path.resolve(
              import.meta.dirname,
              'packages/kitcn/src/aggregate/index.ts'
            ),
            'kitcn/orm': path.resolve(
              import.meta.dirname,
              'packages/kitcn/src/orm/index.ts'
            ),
          },
        },
        test: {
          name: 'integration',
          environment: 'edge-runtime',
          server: {
            deps: { inline: ['convex-test', 'kitcn'] },
          },
          include: [
            'convex/**/*.test.ts',
            'convex/**/*.test.tsx',
            'packages/**/*.vitest.ts',
            'packages/**/*.vitest.tsx',
          ],
          exclude: ['**/node_modules/**', '**/tmp/**', '**/src/solid/**'],
        },
      },
      {
        plugins: [solid()],
        test: {
          name: 'solid',
          environment: 'happy-dom',
          include: ['packages/kitcn/src/solid/**/*.vitest.{ts,tsx}'],
          exclude: ['**/node_modules/**'],
          setupFiles: ['./tooling/test-setup-solid.ts'],
          globals: true,
          server: {
            deps: {
              // Inline solid deps so Vite applies resolve aliases (prevents Node picking server.js)
              inline: [/solid-js/, /@solidjs/],
            },
          },
        },
        resolve: {
          conditions: ['development', 'browser'],
          // Force browser builds of solid-js (vitest runs in Node which picks server.js)
          alias: [
            { find: 'solid-js/web', replacement: 'solid-js/web/dist/dev.js' },
            {
              find: 'solid-js/store',
              replacement: 'solid-js/store/dist/dev.js',
            },
            { find: /^solid-js$/, replacement: 'solid-js/dist/dev.js' },
          ],
        },
      },
    ],
  },
});
