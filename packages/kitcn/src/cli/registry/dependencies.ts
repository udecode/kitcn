import fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { execa } from 'execa';
import {
  getPackageNameFromInstallSpec,
  resolveSupportedDependencyInstallSpec,
} from '../supported-dependencies.js';
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

const resolvePackageJsonInstallTarget = () => {
  const packageJsonPath = findNearestPackageJsonPath(process.cwd());
  return {
    packageJsonPath: packageJsonPath ?? join(process.cwd(), 'package.json'),
    packageJson: packageJsonPath
      ? (JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as Record<
          string,
          unknown
        >)
      : null,
  };
};

export const inspectPluginDependencyInstall = async (params: {
  descriptor: PluginDescriptor;
}): Promise<PluginDependencyInstallResult> => {
  const packageName = params.descriptor.packageName;
  const packageSpec = resolveSupportedDependencyInstallSpec(
    params.descriptor.packageInstallSpec ?? params.descriptor.packageName
  );
  const { packageJsonPath, packageJson } = resolvePackageJsonInstallTarget();
  if (!packageJson) {
    return {
      packageName,
      packageSpec,
      packageJsonPath,
      installed: false,
      skipped: false,
    };
  }
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

export const resolveMissingDependencyHints = (
  dependencyHints: readonly string[]
) => {
  const { packageJson } = resolvePackageJsonInstallTarget();
  if (!packageJson) {
    return [...dependencyHints];
  }

  return dependencyHints.filter(
    (dependencyHint) =>
      !hasDependency(packageJson, getPackageNameFromInstallSpec(dependencyHint))
  );
};

export const applyDependencyHintsInstall = async (
  dependencyHints: readonly string[],
  execaFn: typeof execa
) => {
  const missingDependencyHints = resolveMissingDependencyHints(dependencyHints);
  if (missingDependencyHints.length === 0) {
    return [];
  }

  const { packageJsonPath } = resolvePackageJsonInstallTarget();
  await execaFn('bun', ['add', ...missingDependencyHints], {
    cwd: dirname(packageJsonPath),
    stdio: 'inherit',
  });

  return missingDependencyHints;
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
