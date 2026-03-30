import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveOwnPackageJsonPath } from './cli';

const mkTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-cli-'));

const writeFile = (filePath: string, content: string) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
};

describe('cli/cli', () => {
  test('resolveOwnPackageJsonPath works from both src and dist entry paths', () => {
    const dir = mkTempDir();
    const packageJsonPath = path.join(dir, 'package.json');
    writeFile(
      packageJsonPath,
      JSON.stringify({ name: 'kitcn', version: '9.9.9' })
    );

    writeFile(path.join(dir, 'src', 'cli', 'cli.ts'), '');
    writeFile(path.join(dir, 'dist', 'cli.mjs'), '');

    expect(
      resolveOwnPackageJsonPath(
        pathToFileUrl(path.join(dir, 'src', 'cli', 'cli.ts'))
      )
    ).toBe(packageJsonPath);
    expect(
      resolveOwnPackageJsonPath(
        pathToFileUrl(path.join(dir, 'dist', 'cli.mjs'))
      )
    ).toBe(packageJsonPath);
  });
});

function pathToFileUrl(filePath: string) {
  const normalized = filePath.replaceAll(path.sep, '/');
  return `file://${normalized.startsWith('/') ? '' : '/'}${normalized}`;
}
