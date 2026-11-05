import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
      // More specific subpaths must precede 'kitcn/orm': Vite alias keys match
      // by prefix in insertion order.
      'kitcn/orm/aggregate-index': path.resolve(
        import.meta.dirname,
        'packages/kitcn/src/orm/aggregate-index/index.ts'
      ),
      'kitcn/orm/migrations': path.resolve(
        import.meta.dirname,
        'packages/kitcn/src/orm/migrations/index.ts'
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
            // More specific subpaths must precede 'kitcn/orm': Vite alias keys
            // match by prefix in insertion order.
            'kitcn/orm/aggregate-index': path.resolve(
              import.meta.dirname,
              'packages/kitcn/src/orm/aggregate-index/index.ts'
            ),
            'kitcn/orm/migrations': path.resolve(
              import.meta.dirname,
              'packages/kitcn/src/orm/migrations/index.ts'
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
          typecheck: {
            enabled: true,
            include: ['packages/**/*.test-d.ts'],
            tsconfig: 'packages/kitcn/tsconfig.type-tests.json',
          },
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
          // vite-plugin-solid adds jest-dom's setup by bare name unless one is
          // listed, and in a worktree under .claude/worktrees that name
          // resolves to the main checkout's copy, which vitest cannot load.
          setupFiles: [
            fileURLToPath(
              import.meta.resolve('@testing-library/jest-dom/vitest')
            ),
            './tooling/test-setup-solid.ts',
          ],
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
