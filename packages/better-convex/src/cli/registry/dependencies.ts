import fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { execa } from 'execa';
import type {
  PluginDependencyInstallResult,
  PluginDescriptor,
} from '../types.js';

const findNearestPackageJsonPath = (startDir: string): string | undefined => {
  let current = resolve(startDir);
  while (true) {
    const candidate = join(current, 'package.json');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return;
    }
    current = parent;
  }
};

const hasDependency = (
  pkgJson: Record<string, unknown>,
  packageName: string
): boolean => {
  const sections = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ] as const;
  return sections.some((section) => {
    const value = pkgJson[section];
    return (
      typeof value === 'object' &&
      value !== null &&
      packageName in (value as Record<string, unknown>)
    );
  });
};

export const inspectPluginDependencyInstall = async (params: {
  descriptor: PluginDescriptor;
}): Promise<PluginDependencyInstallResult> => {
  const packageName = params.descriptor.packageName;
  const packageSpec =
    params.descriptor.packageInstallSpec ?? params.descriptor.packageName;
  const packageJsonPath = findNearestPackageJsonPath(process.cwd());
  if (!packageJsonPath) {
    return {
      packageName,
      packageSpec,
      packageJsonPath: join(process.cwd(), 'package.json'),
      installed: false,
      skipped: false,
    };
  }
  const packageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, 'utf8')
  ) as Record<string, unknown>;
  if (hasDependency(packageJson, packageName)) {
    return {
      packageName,
      packageSpec,
      packageJsonPath,
      installed: false,
      skipped: true,
      reason: 'already_present',
    };
  }

  return {
    packageName,
    packageSpec,
    packageJsonPath,
    installed: false,
    skipped: false,
  };
};

export const applyPluginDependencyInstall = async (
  install: PluginDependencyInstallResult,
  execaFn: typeof execa
): Promise<PluginDependencyInstallResult> => {
  if (install.skipped || !install.packageName || !install.packageJsonPath) {
    return install;
  }
  const packageSpec = install.packageSpec ?? install.packageName;

  await execaFn('bun', ['add', packageSpec], {
    cwd: dirname(install.packageJsonPath),
    stdio: 'inherit',
  });
  return {
    packageName: install.packageName,
    packageSpec,
    packageJsonPath: install.packageJsonPath,
    installed: true,
    skipped: false,
  };
};
