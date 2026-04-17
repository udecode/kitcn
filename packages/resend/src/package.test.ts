import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('@kitcn/resend packaging', () => {
  const packageDir = path.resolve(import.meta.dir, '..');
  const distDir = path.join(packageDir, 'dist');

  test(
    'packs dist output even when dist is missing before pack',
    () => {
      const backupDir = path.join(
        packageDir,
        `.dist-backup-${process.pid}-${Date.now()}`
      );
      const packDir = mkdtempSync(path.join(os.tmpdir(), 'kitcn-resend-pack-'));
      const hadOriginalDist = existsSync(distDir);
      const hadOriginalIndexJs = existsSync(path.join(distDir, 'index.js'));
      const hadOriginalIndexDts = existsSync(path.join(distDir, 'index.d.ts'));

      if (hadOriginalDist) {
        renameSync(distDir, backupDir);
      } else {
        mkdirSync(backupDir, { recursive: true });
      }

      try {
        const pack = Bun.spawnSync({
          cmd: ['npm', 'pack', '--json'],
          cwd: packageDir,
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            ...process.env,
            npm_config_pack_destination: packDir,
          },
        });

        expect(pack.exitCode).toBe(0);

        const tarballName = readdirSync(packDir).find((file) =>
          file.endsWith('.tgz')
        );

        expect(tarballName).toBeDefined();

        const tarballPath = path.join(packDir, tarballName!);
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
          exports?: Record<string, string>;
        };

        expect(packedPackageJson.exports?.['.']).toBe('./dist/index.js');

        const packedEntry = Bun.spawnSync({
          cmd: ['tar', '-xOf', tarballPath, 'package/dist/index.js'],
          cwd: packageDir,
          stdout: 'pipe',
          stderr: 'pipe',
          env: process.env,
        });

        expect(packedEntry.exitCode).toBe(0);
        expect(new TextDecoder().decode(packedEntry.stdout)).toContain(
          'definePlugin("resend"'
        );
      } finally {
        rmSync(distDir, { force: true, recursive: true });
        if (hadOriginalDist) {
          cpSync(backupDir, distDir, { recursive: true });
        }
        rmSync(backupDir, { force: true, recursive: true });
        rmSync(packDir, { force: true, recursive: true });
      }

      expect(existsSync(path.join(distDir, 'index.js'))).toBe(
        hadOriginalIndexJs
      );
      expect(existsSync(path.join(distDir, 'index.d.ts'))).toBe(
        hadOriginalIndexDts
      );
      if (hadOriginalIndexJs) {
        expect(readFileSync(path.join(distDir, 'index.js'), 'utf8')).toContain(
          'definePlugin("resend"'
        );
      }
    },
    { timeout: 15_000 }
  );
});
