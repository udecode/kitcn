import fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { execa } from 'execa';
import {
  getPackageNameFromInstallSpec,
  OPENTELEMETRY_API_INSTALL_SPEC,
  resolveSupportedDependencyInstallSpec,
} from '../supported-dependencies.js';
import type {
  PluginDependencyInstallResult,
  PluginDescriptor,
} from '../types.js';

const BUN_LOCK_PATH = 'bun.lock';
const BETTER_AUTH_CORE_LOCK_MARKER = '@better-auth/core';

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

export const resolveBunPeerWarningPreinstallSpecs = () => {
  const { packageJsonPath, packageJson } = resolvePackageJsonInstallTarget();
  if (!packageJsonPath || !packageJson) {
    return [];
  }

  const hasKitcnManagedRuntime =
    hasDependency(packageJson, 'kitcn') ||
    hasDependency(packageJson, 'better-auth');
  if (!hasKitcnManagedRuntime) {
    return [];
  }

  if (
    hasDependency(
      packageJson,
      getPackageNameFromInstallSpec(OPENTELEMETRY_API_INSTALL_SPEC)
    )
  ) {
    return [];
  }

  const bunLockPath = join(dirname(packageJsonPath), BUN_LOCK_PATH);
  if (!fs.existsSync(bunLockPath)) {
    return [];
  }

  const bunLockSource = fs.readFileSync(bunLockPath, 'utf8');
  if (!bunLockSource.includes(BETTER_AUTH_CORE_LOCK_MARKER)) {
    return [];
  }

  return [OPENTELEMETRY_API_INSTALL_SPEC];
};

const applyBunPeerWarningPreinstall = async (execaFn: typeof execa) => {
  const dependencySpecs = resolveBunPeerWarningPreinstallSpecs();
  if (dependencySpecs.length === 0) {
    return [];
  }

  const { packageJsonPath } = resolvePackageJsonInstallTarget();
  await execaFn('bun', ['add', ...dependencySpecs], {
    cwd: dirname(packageJsonPath!),
    stdio: 'inherit',
  });

  return dependencySpecs;
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
  const preinstalledSpecs = await applyBunPeerWarningPreinstall(execaFn);
  const missingDependencyHints = resolveMissingDependencyHints(
    dependencyHints
  ).filter((dependencyHint) => !preinstalledSpecs.includes(dependencyHint));
  const installSpecs = missingDependencyHints.map((dependencyHint) =>
    resolveSupportedDependencyInstallSpec(dependencyHint)
  );
  if (installSpecs.length === 0) {
    return preinstalledSpecs;
  }

  const { packageJsonPath } = resolvePackageJsonInstallTarget();
  await execaFn('bun', ['add', ...installSpecs], {
    cwd: dirname(packageJsonPath),
    stdio: 'inherit',
  });

  return [...preinstalledSpecs, ...installSpecs];
};

export const applyPlanningDependencyInstall = async (
  dependencySpecs: readonly string[],
  execaFn: typeof execa
) => {
  const preinstalledSpecs = await applyBunPeerWarningPreinstall(execaFn);
  const missingDependencySpecs = resolveMissingDependencyHints(
    dependencySpecs
  ).filter((dependencySpec) => !preinstalledSpecs.includes(dependencySpec));
  const installSpecs = missingDependencySpecs.map((dependencySpec) =>
    resolveSupportedDependencyInstallSpec(dependencySpec)
  );
  if (installSpecs.length === 0) {
    return preinstalledSpecs;
  }

  const { packageJsonPath } = resolvePackageJsonInstallTarget();
  await execaFn('bun', ['add', ...installSpecs], {
    cwd: dirname(packageJsonPath),
    stdio: 'inherit',
  });

  return [...preinstalledSpecs, ...installSpecs];
};

export const applyPluginDependencyInstall = async (
  install: PluginDependencyInstallResult,
  execaFn: typeof execa
): Promise<PluginDependencyInstallResult> => {
  if (install.skipped || !install.packageName || !install.packageJsonPath) {
    return install;
  }
  await applyBunPeerWarningPreinstall(execaFn);
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
