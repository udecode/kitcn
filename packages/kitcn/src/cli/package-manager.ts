import fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type PackageManager = 'bun' | 'pnpm' | 'yarn' | 'npm';

export function detectPackageManager(projectDir: string): PackageManager {
  let current = resolve(projectDir);
  while (true) {
    const packageJsonPath = join(current, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
          packageManager?: unknown;
        };
        if (typeof pkg.packageManager === 'string') {
          if (pkg.packageManager.startsWith('bun@')) return 'bun';
          if (pkg.packageManager.startsWith('pnpm@')) return 'pnpm';
          if (pkg.packageManager.startsWith('yarn@')) return 'yarn';
          if (pkg.packageManager.startsWith('npm@')) return 'npm';
        }
      } catch {
        // Later package.json reads fail loudly if the file is invalid.
      }
    }

    if (
      fs.existsSync(join(current, 'bun.lock')) ||
      fs.existsSync(join(current, 'bun.lockb'))
    ) {
      return 'bun';
    }
    if (
      fs.existsSync(join(current, 'pnpm-lock.yaml')) ||
      fs.existsSync(join(current, 'pnpm-workspace.yaml'))
    ) {
      return 'pnpm';
    }
    if (fs.existsSync(join(current, 'yarn.lock'))) {
      return 'yarn';
    }
    if (fs.existsSync(join(current, 'package-lock.json'))) {
      return 'npm';
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return 'bun';
}

export function resolveDependencyInstallCommand(
  packageManager: PackageManager,
  packageSpecs: readonly string[]
): { args: string[]; command: PackageManager } {
  return {
    command: packageManager,
    args:
      packageManager === 'npm'
        ? ['install', ...packageSpecs]
        : ['add', ...packageSpecs],
  };
}

export function formatDependencyInstallCommand(
  packageManager: PackageManager,
  packageSpecs: readonly string[]
): string {
  const { args, command } = resolveDependencyInstallCommand(
    packageManager,
    packageSpecs
  );
  return `${command} ${args.join(' ')}`;
}
