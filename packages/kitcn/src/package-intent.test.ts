import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('package intent metadata', () => {
  const packageDir = path.resolve(import.meta.dir, '..');
  const packageJsonPath = path.join(packageDir, 'package.json');

  test('declares intent metadata and packs the convex skill', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      bin?: Record<string, string>;
      exports?: Record<string, string>;
      files?: string[];
      keywords?: string[];
      intent?: {
        version?: number;
        repo?: string;
        docs?: string;
      };
    };

    expect(packageJson.files).toContain('skills');
    expect(packageJson.files).toContain('bin');
    expect(packageJson.keywords).toContain('tanstack-intent');
    expect(packageJson.bin?.intent).toBe('./bin/intent.js');
    expect(packageJson.exports?.['./ratelimit']).toBe(
      './dist/ratelimit/index.js'
    );
    expect(packageJson.exports?.['./ratelimit/react']).toBe(
      './dist/ratelimit/react/index.js'
    );
    expect(packageJson.intent).toEqual({
      version: 1,
      repo: 'udecode/kitcn',
      docs: 'https://kitcn.dev/docs',
    });

    const pack = Bun.spawnSync({
      cmd: ['npm', 'pack', '--json', '--dry-run'],
      cwd: packageDir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: process.env,
    });

    expect(pack.exitCode).toBe(0);

    const [result] = JSON.parse(
      new TextDecoder().decode(pack.stdout)
    ) as Array<{
      files: Array<{ path: string }>;
    }>;

    expect(result?.files.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        'bin/intent.js',
        'skills/convex/SKILL.md',
        'skills/convex/references/setup/index.md',
        'skills/convex/references/features/create-plugins.md',
      ])
    );
  });
});
