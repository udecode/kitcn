import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

describe('package intent metadata', () => {
  const packageDir = path.resolve(import.meta.dir, '..');
  const packageJsonPath = path.join(packageDir, 'package.json');
  const require = createRequire(packageJsonPath);

  const resolveInstalledPackageRoot = (packageName: string) => {
    try {
      return path.dirname(require.resolve(`${packageName}/package.json`));
    } catch {
      const entryPath = require.resolve(packageName);
      let current = path.dirname(entryPath);

      while (true) {
        const candidate = path.join(current, 'package.json');
        if (existsSync(candidate)) {
          const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as {
            name?: string;
          };
          if (parsed.name === packageName) {
            return current;
          }
        }

        const parent = path.dirname(current);
        if (parent === current) {
          throw new Error(
            `Could not resolve installed root for ${packageName}.`
          );
        }
        current = parent;
      }
    }
  };

  test(
    'declares intent metadata and packs the convex skill',
    () => {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
        bin?: Record<string, string>;
        dependencies?: Record<string, string>;
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
      expect(packageJson.dependencies?.typescript).toBeDefined();
      expect(packageJson.exports?.['./ratelimit']).toBe(
        './dist/ratelimit/index.js'
      );
      expect(packageJson.exports?.['./ratelimit/react']).toBe(
        './dist/ratelimit/react/index.js'
      );
      expect(packageJson.exports?.['./auth/start']).toBe(
        './dist/auth/start/index.js'
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
        filename: string;
      }>;

      expect(result?.files.map((file) => file.path)).toEqual(
        expect.arrayContaining([
          'bin/intent.js',
          'skills/convex/SKILL.md',
          'skills/convex/references/setup/index.md',
          'skills/convex/references/features/create-plugins.md',
        ])
      );

      const packDir = mkdtempSync(path.join(os.tmpdir(), 'kitcn-pack-'));

      try {
        const realPack = Bun.spawnSync({
          cmd: ['npm', 'pack', '--json'],
          cwd: packageDir,
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            ...process.env,
            npm_config_pack_destination: packDir,
          },
        });

        expect(realPack.exitCode).toBe(0);

        const [packedResult] = JSON.parse(
          new TextDecoder().decode(realPack.stdout)
        ) as Array<{
          filename: string;
        }>;

        const tarballPath = path.join(packDir, packedResult.filename);
        const extract = Bun.spawnSync({
          cmd: ['tar', '-xOf', tarballPath, 'package/package.json'],
          cwd: packageDir,
          stdout: 'pipe',
          stderr: 'pipe',
          env: process.env,
        });

        expect(extract.exitCode).toBe(0);

        const packedPackageJson = JSON.parse(
          new TextDecoder().decode(extract.stdout)
        ) as {
          dependencies?: Record<string, string>;
        };

        expect(packedPackageJson.dependencies?.typescript).toBeDefined();
      } finally {
        rmSync(packDir, { force: true, recursive: true });
      }
    },
    { timeout: 15_000 }
  );

  test('packed cli prints version without typescript in the install tree', () => {
    const packDir = mkdtempSync(path.join(os.tmpdir(), 'kitcn-pack-'));
    const installDir = mkdtempSync(path.join(os.tmpdir(), 'kitcn-install-'));

    try {
      const realPack = Bun.spawnSync({
        cmd: ['npm', 'pack', '--json'],
        cwd: packageDir,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          npm_config_pack_destination: packDir,
        },
      });

      expect(realPack.exitCode).toBe(0);

      const [packedResult] = JSON.parse(
        new TextDecoder().decode(realPack.stdout)
      ) as Array<{
        filename: string;
      }>;

      const tarballPath = path.join(packDir, packedResult.filename);
      const installNodeModulesDir = path.join(installDir, 'node_modules');
      const packageInstallDir = path.join(installNodeModulesDir, 'kitcn');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
        dependencies?: Record<string, string>;
        version?: string;
      };

      mkdirSync(packageInstallDir, { recursive: true });

      const unpack = Bun.spawnSync({
        cmd: [
          'tar',
          '-xzf',
          tarballPath,
          '-C',
          packageInstallDir,
          '--strip-components=1',
        ],
        cwd: packageDir,
        stdout: 'pipe',
        stderr: 'pipe',
        env: process.env,
      });

      expect(unpack.exitCode).toBe(0);

      for (const dependencyName of [
        ...Object.keys(packageJson.dependencies ?? {}),
        'convex',
      ]) {
        if (dependencyName === 'type-fest' || dependencyName === 'typescript') {
          continue;
        }
        const dependencyRoot = resolveInstalledPackageRoot(dependencyName);
        const dependencyLinkPath = path.join(
          installNodeModulesDir,
          ...dependencyName.split('/')
        );
        mkdirSync(path.dirname(dependencyLinkPath), { recursive: true });
        symlinkSync(dependencyRoot, dependencyLinkPath);
      }

      expect(existsSync(path.join(installNodeModulesDir, 'typescript'))).toBe(
        false
      );

      const versionResult = Bun.spawnSync({
        cmd: [
          'node',
          path.join(packageInstallDir, 'dist', 'cli.mjs'),
          '--version',
        ],
        cwd: installDir,
        stdout: 'pipe',
        stderr: 'pipe',
        env: process.env,
      });

      expect(versionResult.exitCode).toBe(0);
      expect(new TextDecoder().decode(versionResult.stdout).trim()).toBe(
        packageJson.version
      );
    } finally {
      rmSync(packDir, { force: true, recursive: true });
      rmSync(installDir, { force: true, recursive: true });
    }
  });

  test('packed backend-core keeps the direct kitcn/server parse shim rewrite', () => {
    const packDir = mkdtempSync(path.join(os.tmpdir(), 'kitcn-pack-'));

    try {
      const realPack = Bun.spawnSync({
        cmd: ['npm', 'pack', '--json'],
        cwd: packageDir,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          npm_config_pack_destination: packDir,
        },
      });

      expect(realPack.exitCode).toBe(0);

      const [packedResult] = JSON.parse(
        new TextDecoder().decode(realPack.stdout)
      ) as Array<{
        filename: string;
      }>;

      const tarballPath = path.join(packDir, packedResult.filename);
      const list = Bun.spawnSync({
        cmd: ['tar', '-tzf', tarballPath],
        cwd: packageDir,
        stdout: 'pipe',
        stderr: 'pipe',
        env: process.env,
      });

      expect(list.exitCode).toBe(0);

      const backendCorePath = new TextDecoder()
        .decode(list.stdout)
        .split('\n')
        .find((entry) => /^package\/dist\/backend-core-.*\.mjs$/.test(entry));

      expect(backendCorePath).toBeDefined();

      const extract = Bun.spawnSync({
        cmd: ['tar', '-xOf', tarballPath, backendCorePath!],
        cwd: packageDir,
        stdout: 'pipe',
        stderr: 'pipe',
        env: process.env,
      });

      expect(extract.exitCode).toBe(0);

      const backendCoreSource = new TextDecoder().decode(extract.stdout);

      expect(backendCoreSource).toContain('getProjectServerParserShimPath');
      expect(backendCoreSource).toContain('kitcn-parse.ts');
      expect(backendCoreSource).toContain('kitcn/server');
      expect(backendCoreSource).toContain('tryNative: false');
    } finally {
      rmSync(packDir, { force: true, recursive: true });
    }
  });
});
