import { SUPPORTED_DEPENDENCY_VERSIONS } from '../../../supported-dependencies.js';

type ProjectPackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
};

type InitExpoPackageJsonTemplateOptions = {
  backend?: 'convex' | 'concave';
  functionsDirRelative?: string;
};

const INIT_EXPO_CODEGEN_SCRIPT = 'kitcn codegen';
const INIT_EXPO_PRIMARY_CODEGEN_SCRIPT_NAME = 'codegen';
const INIT_EXPO_FALLBACK_CODEGEN_SCRIPT_NAME = 'convex:codegen';
const INIT_EXPO_CONVEX_DEV_SCRIPT_NAME = 'convex:dev';
const INIT_EXPO_CONVEX_DEV_SCRIPT = 'kitcn dev';
const INIT_EXPO_CONVEX_TYPECHECK_SCRIPT_NAME = 'typecheck:convex';

const getInitExpoConvexTypecheckScript = (
  functionsDirRelative = 'convex/functions'
) => `tsc --noEmit --project ${functionsDirRelative}/tsconfig.json`;

const INIT_EXPO_PACKAGE_JSON_DEPENDENCIES = {
  '@opentelemetry/api': SUPPORTED_DEPENDENCY_VERSIONS.opentelemetryApi.exact,
  superjson: '2.2.6',
} as const;

const INIT_EXPO_PACKAGE_JSON_DEV_DEPENDENCIES = {
  '@types/bun': 'latest',
} as const;

const getInitExpoPackageJsonDevDependencies = (
  options: InitExpoPackageJsonTemplateOptions
) => ({
  ...INIT_EXPO_PACKAGE_JSON_DEV_DEPENDENCIES,
  ...(options.backend === 'concave'
    ? {
        '@concavejs/cli': 'latest',
      }
    : {}),
});

export function renderInitExpoPackageJsonTemplate(
  source?: string,
  options: InitExpoPackageJsonTemplateOptions = {}
): string {
  const existing = source ? (JSON.parse(source) as ProjectPackageJson) : {};
  const nextScripts: Record<string, string> = {
    ...existing.scripts,
    typecheck: 'tsc --noEmit && bun run typecheck:convex',
  };

  if (!nextScripts[INIT_EXPO_PRIMARY_CODEGEN_SCRIPT_NAME]) {
    nextScripts[INIT_EXPO_PRIMARY_CODEGEN_SCRIPT_NAME] =
      INIT_EXPO_CODEGEN_SCRIPT;
  } else if (!nextScripts[INIT_EXPO_FALLBACK_CODEGEN_SCRIPT_NAME]) {
    nextScripts[INIT_EXPO_FALLBACK_CODEGEN_SCRIPT_NAME] =
      INIT_EXPO_CODEGEN_SCRIPT;
  }

  if (!nextScripts[INIT_EXPO_CONVEX_DEV_SCRIPT_NAME]) {
    nextScripts[INIT_EXPO_CONVEX_DEV_SCRIPT_NAME] = INIT_EXPO_CONVEX_DEV_SCRIPT;
  }

  if (!nextScripts[INIT_EXPO_CONVEX_TYPECHECK_SCRIPT_NAME]) {
    nextScripts[INIT_EXPO_CONVEX_TYPECHECK_SCRIPT_NAME] =
      getInitExpoConvexTypecheckScript(options.functionsDirRelative);
  }

  return `${JSON.stringify(
    {
      ...existing,
      scripts: nextScripts,
      dependencies: {
        ...existing.dependencies,
        ...INIT_EXPO_PACKAGE_JSON_DEPENDENCIES,
      },
      devDependencies: {
        ...existing.devDependencies,
        ...getInitExpoPackageJsonDevDependencies(options),
      },
    },
    null,
    2
  )}\n`;
}
