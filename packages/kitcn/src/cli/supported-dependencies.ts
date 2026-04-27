import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXACT_VERSION_RE = /^(\d+)\.(\d+)\.\d+$/;
const VERSION_IN_SPEC_RE = /(\d+)\.(\d+)(?:\.\d+)?/;
const PLAIN_VERSION_SPEC_RE = /^[\^~]?v?\d+\.\d+(?:\.\d+)?$/;
const UPPER_BOUND_RE = /(?:^|\s)<={0,1}\s*v?(\d+)\.(\d+)(?:\.\d+)?/g;
const SUPPORTED_CONVEX_VERSION = '1.36.1';
const SUPPORTED_BETTER_AUTH_VERSION = '1.6.9';
const SUPPORTED_HONO_VERSION = '4.12.9';
const SUPPORTED_OPENTELEMETRY_API_VERSION = '1.9.0';
const SUPPORTED_TANSTACK_REACT_QUERY_VERSION = '5.95.2';
const SUPPORTED_ZOD_VERSION = '4.3.6';

export const KITCN_INSTALL_SPEC_ENV = 'KITCN_INSTALL_SPEC';
export const KITCN_RESEND_INSTALL_SPEC_ENV = 'KITCN_RESEND_INSTALL_SPEC';

let ownVersion: string | null | undefined;

export function getMinimumVersionRange(version: string): string {
  const match = EXACT_VERSION_RE.exec(version);
  if (!match) {
    throw new Error(
      `Unsupported exact version "${version}". Expected x.y.z format.`
    );
  }

  return `>=${match[1]}.${match[2]}`;
}

export function getPackageNameFromInstallSpec(spec: string): string {
  const normalized = spec.trim();
  if (normalized.length === 0) {
    throw new Error('Install spec must be non-empty.');
  }

  if (!normalized.startsWith('@')) {
    const versionSeparator = normalized.indexOf('@');
    return versionSeparator >= 0
      ? normalized.slice(0, versionSeparator)
      : normalized;
  }

  const scopeSeparator = normalized.indexOf('/');
  if (scopeSeparator < 0) {
    throw new Error(
      `Invalid scoped install spec "${spec}". Expected "@scope/name".`
    );
  }

  const versionSeparator = normalized.indexOf('@', scopeSeparator + 1);
  return versionSeparator >= 0
    ? normalized.slice(0, versionSeparator)
    : normalized;
}

const LOCAL_INSTALL_SPEC_ENV_BY_PACKAGE_NAME = {
  kitcn: KITCN_INSTALL_SPEC_ENV,
  '@kitcn/resend': KITCN_RESEND_INSTALL_SPEC_ENV,
} as const;

export function resolveSupportedDependencyInstallSpec(
  spec: string,
  env: Record<string, string | undefined> = process.env
) {
  if (getPackageNameFromInstallSpec(spec) === 'kitcn') {
    return resolveScaffoldInstallSpec(env);
  }

  const envKey =
    LOCAL_INSTALL_SPEC_ENV_BY_PACKAGE_NAME[
      getPackageNameFromInstallSpec(
        spec
      ) as keyof typeof LOCAL_INSTALL_SPEC_ENV_BY_PACKAGE_NAME
    ];
  const override = envKey ? env[envKey]?.trim() : undefined;
  return override && override.length > 0 ? override : spec;
}

function readOwnVersion() {
  if (ownVersion !== undefined) {
    return ownVersion ?? undefined;
  }

  let currentDir = dirname(fileURLToPath(import.meta.url));
  while (true) {
    const packageJsonPath = join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (parsed.name === 'kitcn') {
        ownVersion = parsed.version ?? null;
        return ownVersion ?? undefined;
      }
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      ownVersion = null;
      return undefined;
    }
    currentDir = parentDir;
  }
}

export function resolveScaffoldInstallSpec(
  env: Record<string, string | undefined> = process.env
) {
  const override = env[KITCN_INSTALL_SPEC_ENV]?.trim();
  if (override) {
    return override;
  }

  const version = readOwnVersion();
  return version ? `kitcn@${version}` : 'kitcn';
}

export const SUPPORTED_DEPENDENCY_VERSIONS = {
  convex: {
    exact: SUPPORTED_CONVEX_VERSION,
    range: `^${SUPPORTED_CONVEX_VERSION}`,
    minimum: getMinimumVersionRange(SUPPORTED_CONVEX_VERSION),
  },
  betterAuth: {
    exact: SUPPORTED_BETTER_AUTH_VERSION,
  },
  hono: {
    exact: SUPPORTED_HONO_VERSION,
  },
  opentelemetryApi: {
    exact: SUPPORTED_OPENTELEMETRY_API_VERSION,
  },
  tanstackReactQuery: {
    exact: SUPPORTED_TANSTACK_REACT_QUERY_VERSION,
  },
  zod: {
    exact: SUPPORTED_ZOD_VERSION,
    range: `^${SUPPORTED_ZOD_VERSION}`,
  },
} as const;

export const PINNED_CONVEX_INSTALL_SPEC = `convex@${SUPPORTED_DEPENDENCY_VERSIONS.convex.exact}`;
export const BETTER_AUTH_INSTALL_SPEC = `better-auth@${SUPPORTED_DEPENDENCY_VERSIONS.betterAuth.exact}`;
export const PINNED_HONO_INSTALL_SPEC = `hono@${SUPPORTED_DEPENDENCY_VERSIONS.hono.exact}`;
export const OPENTELEMETRY_API_INSTALL_SPEC = `@opentelemetry/api@${SUPPORTED_DEPENDENCY_VERSIONS.opentelemetryApi.exact}`;
export const PINNED_TANSTACK_REACT_QUERY_INSTALL_SPEC = `@tanstack/react-query@${SUPPORTED_DEPENDENCY_VERSIONS.tanstackReactQuery.exact}`;
export const PINNED_ZOD_INSTALL_SPEC = `zod@${SUPPORTED_DEPENDENCY_VERSIONS.zod.range}`;

export const BASELINE_DEPENDENCY_INSTALL_SPECS = [
  PINNED_CONVEX_INSTALL_SPEC,
  PINNED_ZOD_INSTALL_SPEC,
  PINNED_TANSTACK_REACT_QUERY_INSTALL_SPEC,
  PINNED_HONO_INSTALL_SPEC,
] as const;

export const INIT_TEMPLATE_DEPENDENCY_INSTALL_SPECS = ['superjson'] as const;

const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

type PackageJsonWithDependencies = {
  [key in (typeof DEPENDENCY_SECTIONS)[number]]?: Record<string, string>;
};

export type SupportedDependencyWarning = {
  packageName: string;
  current: string;
  minimum: string;
  installSpec: string;
};

function findNearestPackageJsonPath(cwd: string): string | undefined {
  let currentDir = cwd;
  while (true) {
    const packageJsonPath = join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return packageJsonPath;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
  }
}

function readDependencyVersion(
  packageJson: PackageJsonWithDependencies,
  packageName: string
): string | undefined {
  for (const section of DEPENDENCY_SECTIONS) {
    const version = packageJson[section]?.[packageName];
    if (version) {
      return version;
    }
  }
}

function readInstalledDependencyVersion(
  packageJsonPath: string,
  packageName: string
): string | undefined {
  const installedPackageJsonPath = join(
    dirname(packageJsonPath),
    'node_modules',
    ...packageName.split('/'),
    'package.json'
  );
  if (!fs.existsSync(installedPackageJsonPath)) {
    return undefined;
  }
  const packageJson = JSON.parse(
    fs.readFileSync(installedPackageJsonPath, 'utf8')
  ) as { version?: string };
  return packageJson.version;
}

function compareMajorMinor(
  aMajor: number,
  aMinor: number,
  bMajor: number,
  bMinor: number
) {
  if (aMajor !== bMajor) {
    return aMajor - bMajor;
  }
  return aMinor - bMinor;
}

function isConcreteVersionSpecBelowMinimum(
  spec: string,
  minimum: string
): boolean {
  const specMatch = VERSION_IN_SPEC_RE.exec(spec);
  const minimumMatch = VERSION_IN_SPEC_RE.exec(minimum);
  if (!specMatch || !minimumMatch) {
    return false;
  }

  const specMajor = Number(specMatch[1]);
  const specMinor = Number(specMatch[2]);
  const minimumMajor = Number(minimumMatch[1]);
  const minimumMinor = Number(minimumMatch[2]);

  return (
    compareMajorMinor(specMajor, specMinor, minimumMajor, minimumMinor) < 0
  );
}

function isDeclaredVersionSpecBelowMinimum(
  spec: string,
  minimum: string
): boolean {
  const normalized = spec.trim();
  if (PLAIN_VERSION_SPEC_RE.test(normalized)) {
    return isConcreteVersionSpecBelowMinimum(normalized, minimum);
  }

  const minimumMatch = VERSION_IN_SPEC_RE.exec(minimum);
  if (!minimumMatch) {
    return false;
  }
  const minimumMajor = Number(minimumMatch[1]);
  const minimumMinor = Number(minimumMatch[2]);

  for (const match of normalized.matchAll(UPPER_BOUND_RE)) {
    const upperMajor = Number(match[1]);
    const upperMinor = Number(match[2]);
    if (
      compareMajorMinor(upperMajor, upperMinor, minimumMajor, minimumMinor) <= 0
    ) {
      return true;
    }
  }

  return false;
}

export function resolveSupportedDependencyWarnings(
  cwd = process.cwd()
): SupportedDependencyWarning[] {
  const packageJsonPath = findNearestPackageJsonPath(cwd);
  if (!packageJsonPath) {
    return [];
  }

  const packageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, 'utf8')
  ) as PackageJsonWithDependencies;
  const installedConvexVersion = readInstalledDependencyVersion(
    packageJsonPath,
    'convex'
  );
  if (
    installedConvexVersion &&
    isConcreteVersionSpecBelowMinimum(
      installedConvexVersion,
      SUPPORTED_DEPENDENCY_VERSIONS.convex.minimum
    )
  ) {
    return [
      {
        packageName: 'convex',
        current: installedConvexVersion,
        minimum: SUPPORTED_DEPENDENCY_VERSIONS.convex.minimum,
        installSpec: PINNED_CONVEX_INSTALL_SPEC,
      },
    ];
  }

  const convexVersion = readDependencyVersion(packageJson, 'convex');
  if (
    !convexVersion ||
    !isDeclaredVersionSpecBelowMinimum(
      convexVersion,
      SUPPORTED_DEPENDENCY_VERSIONS.convex.minimum
    )
  ) {
    return [];
  }

  return [
    {
      packageName: 'convex',
      current: convexVersion,
      minimum: SUPPORTED_DEPENDENCY_VERSIONS.convex.minimum,
      installSpec: PINNED_CONVEX_INSTALL_SPEC,
    },
  ];
}
