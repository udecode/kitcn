const EXACT_VERSION_RE = /^(\d+)\.(\d+)\.\d+$/;
const SUPPORTED_CONVEX_VERSION = '1.33.0';
const SUPPORTED_BETTER_AUTH_VERSION = '1.5.3';

export const BETTER_CONVEX_INSTALL_SPEC_ENV = 'BETTER_CONVEX_INSTALL_SPEC';
export const BETTER_CONVEX_RESEND_INSTALL_SPEC_ENV =
  'BETTER_CONVEX_RESEND_INSTALL_SPEC';

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
  'better-convex': BETTER_CONVEX_INSTALL_SPEC_ENV,
  '@better-convex/resend': BETTER_CONVEX_RESEND_INSTALL_SPEC_ENV,
} as const;

export function resolveSupportedDependencyInstallSpec(
  spec: string,
  env: Record<string, string | undefined> = process.env
) {
  const envKey =
    LOCAL_INSTALL_SPEC_ENV_BY_PACKAGE_NAME[
      getPackageNameFromInstallSpec(
        spec
      ) as keyof typeof LOCAL_INSTALL_SPEC_ENV_BY_PACKAGE_NAME
    ];
  const override = envKey ? env[envKey]?.trim() : undefined;
  return override && override.length > 0 ? override : spec;
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
} as const;

export const PINNED_CONVEX_INSTALL_SPEC = `convex@${SUPPORTED_DEPENDENCY_VERSIONS.convex.exact}`;
export const BETTER_AUTH_INSTALL_SPEC = `better-auth@${SUPPORTED_DEPENDENCY_VERSIONS.betterAuth.exact}`;

export const BASELINE_DEPENDENCY_INSTALL_SPECS = [
  PINNED_CONVEX_INSTALL_SPEC,
  'zod',
  '@tanstack/react-query',
  'hono',
] as const;

export const INIT_TEMPLATE_DEPENDENCY_INSTALL_SPECS = ['superjson'] as const;
