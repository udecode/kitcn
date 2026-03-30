import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveProjectScaffoldContext } from './project-context';
import { writePackageJson, writeShadcnViteApp } from './test-utils';

describe('cli/project-context', () => {
  test('resolveProjectScaffoldContext does not require a Vite entry file for react-router apps', () => {
    const reactRouterDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-project-context-react-router-')
    );
    writePackageJson(reactRouterDir, {
      name: 'react-router-app',
      private: true,
      dependencies: {
        react: '^19.0.0',
        'react-dom': '^19.0.0',
      },
    });
    fs.writeFileSync(
      path.join(reactRouterDir, 'react-router.config.ts'),
      'export default {};\n'
    );

    expect(resolveProjectScaffoldContext({ cwd: reactRouterDir })).toEqual(
      expect.objectContaining({
        framework: 'react-router',
        mode: 'react',
        clientEntryFile: null,
      })
    );
  });

  test('resolveProjectScaffoldContext still detects a client entry file for vite apps', () => {
    const viteDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-project-context-vite-')
    );
    writeShadcnViteApp(viteDir);

    expect(resolveProjectScaffoldContext({ cwd: viteDir })).toEqual(
      expect.objectContaining({
        framework: 'vite',
        mode: 'react',
        clientEntryFile: 'src/main.tsx',
      })
    );
  });
});
