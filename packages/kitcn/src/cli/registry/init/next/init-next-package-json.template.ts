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
const VERSION_MAJOR_RE = /\d+/;

const INIT_NEXT_PACKAGE_JSON_DEV_DEPENDENCIES = {
  '@types/bun': 'latest',
} as const;

export const resolveInitNextEslintVersion = (
  eslintConfigNextVersion: string | undefined
) => {
  const majorMatch = eslintConfigNextVersion?.match(VERSION_MAJOR_RE);
  if (!majorMatch) {
    return undefined;
  }

  return Number(majorMatch[0]) >= MIN_ESLINT_9_NEXT_CONFIG_MAJOR
    ? INIT_NEXT_ESLINT_VERSION
    : undefined;
};

const getInitNextPackageJsonDevDependencies = (
  options: InitPackageJsonTemplateOptions,
  existing: ProjectPackageJson
) => ({
  ...INIT_NEXT_PACKAGE_JSON_DEV_DEPENDENCIES,
  ...(resolveInitNextEslintVersion(
    existing.devDependencies?.['eslint-config-next']
  )
    ? { eslint: INIT_NEXT_ESLINT_VERSION }
    : {}),
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
        ...existing.dependencies,
        ...INIT_NEXT_PACKAGE_JSON_DEPENDENCIES,
      },
      devDependencies: {
        ...existing.devDependencies,
        ...getInitNextPackageJsonDevDependencies(options, existing),
      },
    },
    null,
    2
  )}\n`;
}
