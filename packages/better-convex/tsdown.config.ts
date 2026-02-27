import pluginBabel from '@rollup/plugin-babel';
import { defineConfig } from 'tsdown';

const babelPlugin = pluginBabel({
  babelHelpers: 'bundled',
  parserOpts: {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  },
  plugins: ['babel-plugin-react-compiler'],
  extensions: ['.js', '.jsx', '.ts', '.tsx'],
});

export default defineConfig([
  // Client builds (auth/client, react) - need "use client" directive
  {
    entry: {
      'auth/client/index': 'src/auth-client/index.ts',
      'react/index': 'src/react/index.ts',
      'plugins/ratelimit/react/index': 'src/plugins/ratelimit/react/index.ts',
    },
    platform: 'neutral',
    target: 'esnext',
    tsconfig: 'tooling/tsconfig.build.json',
    exports: true,
    dts: true,
    banner: "'use client';",
    plugins: [babelPlugin],
    checks: { pluginTimings: false },
  },
  // Server-safe builds (crpc, rsc, server, orm) - no "use client"
  {
    entry: {
      'aggregate/index': 'src/aggregate/index.ts',
      'auth/config/index': 'src/auth-config/index.ts',
      'auth/http/index': 'src/auth-http/index.ts',
      'auth/index': 'src/auth/index.ts',
      'auth/nextjs/index': 'src/auth-nextjs/index.ts',
      'crpc/index': 'src/crpc/index.ts',
      'plugins/index': 'src/plugins/index.ts',
      'plugins/ratelimit/index': 'src/plugins/ratelimit/index.ts',
      'rsc/index': 'src/rsc/index.ts',
      'server/index': 'src/server/index.ts',
      'orm/index': 'src/orm/index.ts',
    },
    // Keep CI strict: only allow this known transitive Better Auth dep to inline.
    inlineOnly: ['kysely'],
    platform: 'neutral',
    target: 'esnext',
    tsconfig: 'tooling/tsconfig.build.json',
    exports: true,
    dts: true,
    checks: { pluginTimings: false },
  },
  // CLI builds (ESM) - skip bundling node_modules like tsup
  {
    entry: ['src/cli/cli.ts', 'src/cli/watcher.ts'],
    format: 'esm',
    platform: 'node',
    target: 'esnext',
    tsconfig: 'tooling/tsconfig.build.json',
    shims: true,
    skipNodeModulesBundle: true,
    banner: '#!/usr/bin/env node',
    checks: { pluginTimings: false },
  },
]);
