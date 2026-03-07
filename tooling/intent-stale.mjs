import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
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

  execFileSync('npm', ['install', '--silent', `./${tarball}`], {
    cwd: tempDir,
    stdio: 'ignore',
  });

  const result = spawnSync(
    process.execPath,
    [
      resolve(repoRoot, 'node_modules/@tanstack/intent/dist/cli.mjs'),
      'stale',
      ...process.argv.slice(2),
    ],
    {
      cwd: tempDir,
      stdio: 'inherit',
    }
  );

  process.exit(result.status ?? 1);
} finally {
  rmSync(tempDir, {
    force: true,
    recursive: true,
  });
}
