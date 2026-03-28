import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const isMain = process.argv[1] === fileURLToPath(import.meta.url);

export const resolveInstalledIntentCliPath = (dir) =>
  resolve(dir, 'node_modules/@tanstack/intent/dist/cli.mjs');

export const getRepoIntentInstallSpec = () => {
  const packageJson = JSON.parse(
    readFileSync(
      resolve(repoRoot, 'packages/better-convex/package.json'),
      'utf8'
    )
  );
  const version = packageJson.devDependencies?.['@tanstack/intent'];

  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(
      'packages/better-convex/package.json is missing devDependencies["@tanstack/intent"].'
    );
  }

  return `@tanstack/intent@${version}`;
};

export const runIntentStale = (argv = process.argv.slice(2)) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'intent-stale-'));

  try {
    const tarballOutput = execFileSync(
      'npm',
      [
        'pack',
        '--silent',
        '--pack-destination',
        tempDir,
        './packages/better-convex',
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      }
    );
    const tarball = tarballOutput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1);

    if (!tarball) {
      throw new Error('npm pack did not produce a tarball name');
    }

    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'intent-stale-check',
        private: true,
      })
    );

    execFileSync(
      'npm',
      ['install', '--silent', `./${tarball}`, getRepoIntentInstallSpec()],
      {
        cwd: tempDir,
        stdio: 'ignore',
      }
    );

    const result = spawnSync(
      process.execPath,
      [resolveInstalledIntentCliPath(tempDir), 'stale', ...argv],
      {
        cwd: tempDir,
        stdio: 'inherit',
      }
    );

    return result.status ?? 1;
  } finally {
    rmSync(tempDir, {
      force: true,
      recursive: true,
    });
  }
};

if (isMain) {
  process.exit(runIntentStale());
}
