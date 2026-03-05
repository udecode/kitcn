import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    schema: 'src/schema.ts',
    react: 'src/react.ts',
  },
  platform: 'neutral',
  target: 'esnext',
  exports: true,
  dts: true,
  tsconfig: '../better-convex/tooling/tsconfig.build.json',
  checks: { pluginTimings: false },
});
