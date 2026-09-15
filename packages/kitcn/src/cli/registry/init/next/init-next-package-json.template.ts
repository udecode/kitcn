import { SUPPORTED_DEPENDENCY_VERSIONS } from '../../../supported-dependencies.js';

type ProjectPackageJson = {
  name?: string;
  version?: string;
  type?: string;
  private?: boolean;
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
};

type InitPackageJsonTemplateOptions = {
  backend?: 'convex' | 'concave';
  functionsDirRelative?: string;
};

const INIT_NEXT_PACKAGE_JSON_SCRIPTS = {
  dev: 'next dev --turbopack',
  build: 'next build',
  start: 'next start',
  lint: 'eslint',
  format: 'prettier --write "**/*.{ts,tsx}"',
  typecheck: 'tsc --noEmit && bun run typecheck:convex',
} as const;

const INIT_NEXT_CODEGEN_SCRIPT = 'kitcn codegen';
const INIT_NEXT_PRIMARY_CODEGEN_SCRIPT_NAME = 'codegen';
const INIT_NEXT_FALLBACK_CODEGEN_SCRIPT_NAME = 'convex:codegen';
const INIT_NEXT_CONVEX_DEV_SCRIPT_NAME = 'convex:dev';
const INIT_NEXT_CONVEX_DEV_SCRIPT = 'kitcn dev';
const INIT_NEXT_CONVEX_TYPECHECK_SCRIPT_NAME = 'typecheck:convex';

const getInitNextConvexTypecheckScript = (
  functionsDirRelative = 'convex/functions'
) => `tsc --noEmit --project ${functionsDirRelative}/tsconfig.json`;

const INIT_NEXT_PACKAGE_JSON_DEPENDENCIES = {
  '@opentelemetry/api': SUPPORTED_DEPENDENCY_VERSIONS.opentelemetryApi.exact,
  superjson: '2.2.6',
} as const;

export const INIT_NEXT_ESLINT_VERSION = '9.39.5';
const MIN_ESLINT_9_NEXT_CONFIG_MAJOR = 15;
const EXTERNALLY_MANAGED_VERSION_RE = /^(?:catalog|workspace):/;
const SIMPLE_VERSION_MAJOR_RE =
  /^(?:[v=~^]\s*)?(\d+)(?:\.(?:\d+|x|\*)){0,2}(?:-[0-9A-Za-z.-]+)?$/i;

const INIT_NEXT_PACKAGE_JSON_DEV_DEPENDENCIES = {
  '@types/bun': 'latest',
} as const;

const resolveSimpleVersionMajor = (version: string | undefined) => {
  const major = version?.trim().match(SIMPLE_VERSION_MAJOR_RE)?.[1];
  return major === undefined ? undefined : Number(major);
};

export const resolveInitNextEslintVersion = (
  eslintConfigNextVersion: string | undefined
) => {
  const major = resolveSimpleVersionMajor(eslintConfigNextVersion);
  if (major === undefined) {
    return undefined;
  }

  return major >= MIN_ESLINT_9_NEXT_CONFIG_MAJOR
    ? INIT_NEXT_ESLINT_VERSION
    : undefined;
};

export const resolveInitNextEslintVersionFromPackageJson = (
  packageJson: Pick<ProjectPackageJson, 'dependencies' | 'devDependencies'>
) => {
  const eslintConfigNextVersion =
    packageJson.devDependencies?.['eslint-config-next'] ??
    packageJson.dependencies?.['eslint-config-next'];
  if (eslintConfigNextVersion === undefined) {
    return undefined;
  }

  const configMajor = resolveSimpleVersionMajor(eslintConfigNextVersion);
  if (configMajor !== undefined) {
    return configMajor >= MIN_ESLINT_9_NEXT_CONFIG_MAJOR
      ? INIT_NEXT_ESLINT_VERSION
      : undefined;
  }

  const nextVersion =
    packageJson.dependencies?.next ?? packageJson.devDependencies?.next;
  const nextMajor = resolveSimpleVersionMajor(nextVersion);
  if (nextMajor !== undefined) {
    return nextMajor >= MIN_ESLINT_9_NEXT_CONFIG_MAJOR
      ? INIT_NEXT_ESLINT_VERSION
      : undefined;
  }

  const eslintVersion =
    packageJson.devDependencies?.eslint ?? packageJson.dependencies?.eslint;
  const eslintMajor = resolveSimpleVersionMajor(eslintVersion);
  if (eslintMajor !== undefined && eslintMajor < 9) {
    return undefined;
  }

  if (
    [eslintConfigNextVersion, nextVersion, eslintVersion].every(
      (version) =>
        version !== undefined && EXTERNALLY_MANAGED_VERSION_RE.test(version)
    )
  ) {
    return undefined;
  }

  return INIT_NEXT_ESLINT_VERSION;
};

const getInitNextPackageJsonDevDependencies = (
  options: InitPackageJsonTemplateOptions,
  eslintVersion: string | undefined
) => ({
  ...INIT_NEXT_PACKAGE_JSON_DEV_DEPENDENCIES,
  ...(eslintVersion ? { eslint: eslintVersion } : {}),
  ...(options.backend === 'concave'
    ? {
        '@concavejs/cli': SUPPORTED_DEPENDENCY_VERSIONS.concaveCli.exact,
      }
    : {}),
});

export function renderInitNextPackageJsonTemplate(
  source?: string,
  options: InitPackageJsonTemplateOptions = {}
): string {
  const existing = source ? (JSON.parse(source) as ProjectPackageJson) : {};
  const eslintVersion = resolveInitNextEslintVersionFromPackageJson(existing);
  const existingDependencies = eslintVersion
    ? Object.fromEntries(
        Object.entries(existing.dependencies ?? {}).filter(
          ([packageName]) => packageName !== 'eslint'
        )
      )
    : existing.dependencies;
  const nextScripts: Record<string, string> = {
    ...existing.scripts,
    ...INIT_NEXT_PACKAGE_JSON_SCRIPTS,
  };

  if (!nextScripts[INIT_NEXT_PRIMARY_CODEGEN_SCRIPT_NAME]) {
    nextScripts[INIT_NEXT_PRIMARY_CODEGEN_SCRIPT_NAME] =
      INIT_NEXT_CODEGEN_SCRIPT;
  } else if (!nextScripts[INIT_NEXT_FALLBACK_CODEGEN_SCRIPT_NAME]) {
    nextScripts[INIT_NEXT_FALLBACK_CODEGEN_SCRIPT_NAME] =
      INIT_NEXT_CODEGEN_SCRIPT;
  }

  if (!nextScripts[INIT_NEXT_CONVEX_DEV_SCRIPT_NAME]) {
    nextScripts[INIT_NEXT_CONVEX_DEV_SCRIPT_NAME] = INIT_NEXT_CONVEX_DEV_SCRIPT;
  }

  if (!nextScripts[INIT_NEXT_CONVEX_TYPECHECK_SCRIPT_NAME]) {
    nextScripts[INIT_NEXT_CONVEX_TYPECHECK_SCRIPT_NAME] =
      getInitNextConvexTypecheckScript(options.functionsDirRelative);
  }

  return `${JSON.stringify(
    {
      ...existing,
      scripts: nextScripts,
      dependencies: {
        ...existingDependencies,
        ...INIT_NEXT_PACKAGE_JSON_DEPENDENCIES,
      },
      devDependencies: {
        ...existing.devDependencies,
        ...getInitNextPackageJsonDevDependencies(options, eslintVersion),
      },
    },
    null,
    2
  )}\n`;
}
