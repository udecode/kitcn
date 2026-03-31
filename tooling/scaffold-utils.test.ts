import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getLocalResendInstallSpec } from './scaffold-utils';

test('getLocalResendInstallSpec packs resend with a package manifest', () => {
  const installSpec = getLocalResendInstallSpec();
  expect(installSpec.startsWith('file:')).toBe(true);

  const tarballPath = installSpec.slice('file:'.length);
  const extractDir = mkdtempSync(
    path.join(tmpdir(), 'kitcn-resend-pack-test-')
  );

  try {
    const extract = Bun.spawnSync({
      cmd: ['tar', '-xzf', tarballPath, '-C', extractDir],
      stderr: 'pipe',
      stdout: 'pipe',
    });

    expect(extract.exitCode).toBe(0);

    const packageJson = JSON.parse(
      readFileSync(path.join(extractDir, 'package', 'package.json'), 'utf8')
    ) as {
      name: string;
      peerDependencies?: Record<string, string>;
    };

    expect(packageJson.name).toBe('@kitcn/resend');
    expect(packageJson.peerDependencies?.kitcn).toBe('>=0.11.0 <1');
  } finally {
    rmSync(extractDir, { force: true, recursive: true });
  }
});
