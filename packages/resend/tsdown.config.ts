import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  platform: 'neutral',
  target: 'esnext',
  exports: true,
  dts: true,
  tsconfig: '../kitcn/tooling/tsconfig.build.json',
  checks: { pluginTimings: false },
});
