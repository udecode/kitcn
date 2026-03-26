type ProjectPackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
};

type InitPackageJsonTemplateOptions = {
  backend?: 'convex' | 'concave';
  functionsDirRelative?: string;
};

const INIT_REACT_CODEGEN_SCRIPT = 'better-convex codegen';
const INIT_REACT_PRIMARY_CODEGEN_SCRIPT_NAME = 'codegen';
const INIT_REACT_FALLBACK_CODEGEN_SCRIPT_NAME = 'convex:codegen';
const INIT_REACT_CONVEX_DEV_SCRIPT_NAME = 'convex:dev';
const INIT_REACT_CONVEX_DEV_SCRIPT = 'better-convex dev';
const INIT_REACT_CONVEX_TYPECHECK_SCRIPT_NAME = 'typecheck:convex';

const getInitReactConvexTypecheckScript = (
  functionsDirRelative = 'convex/functions'
) => `tsc --noEmit --project ${functionsDirRelative}/tsconfig.json`;

const INIT_REACT_PACKAGE_JSON_DEPENDENCIES = {
  superjson: '2.2.6',
} as const;

const INIT_REACT_PACKAGE_JSON_DEV_DEPENDENCIES = {
  '@types/bun': 'latest',
} as const;

const getInitReactPackageJsonDevDependencies = (
  options: InitPackageJsonTemplateOptions
) => ({
  ...INIT_REACT_PACKAGE_JSON_DEV_DEPENDENCIES,
  ...(options.backend === 'concave'
    ? {
        '@concavejs/cli': 'latest',
      }
    : {}),
});

export function renderInitReactPackageJsonTemplate(
  source?: string,
  options: InitPackageJsonTemplateOptions = {}
): string {
  const existing = source ? (JSON.parse(source) as ProjectPackageJson) : {};
  const nextScripts: Record<string, string> = {
    ...existing.scripts,
    typecheck: 'tsc --noEmit && bun run typecheck:convex',
  };

  if (!nextScripts[INIT_REACT_PRIMARY_CODEGEN_SCRIPT_NAME]) {
    nextScripts[INIT_REACT_PRIMARY_CODEGEN_SCRIPT_NAME] =
      INIT_REACT_CODEGEN_SCRIPT;
  } else if (!nextScripts[INIT_REACT_FALLBACK_CODEGEN_SCRIPT_NAME]) {
    nextScripts[INIT_REACT_FALLBACK_CODEGEN_SCRIPT_NAME] =
      INIT_REACT_CODEGEN_SCRIPT;
  }

  if (!nextScripts[INIT_REACT_CONVEX_DEV_SCRIPT_NAME]) {
    nextScripts[INIT_REACT_CONVEX_DEV_SCRIPT_NAME] =
      INIT_REACT_CONVEX_DEV_SCRIPT;
  }

  if (!nextScripts[INIT_REACT_CONVEX_TYPECHECK_SCRIPT_NAME]) {
    nextScripts[INIT_REACT_CONVEX_TYPECHECK_SCRIPT_NAME] =
      getInitReactConvexTypecheckScript(options.functionsDirRelative);
  }

  return `${JSON.stringify(
    {
      ...existing,
      scripts: nextScripts,
      dependencies: {
        ...existing.dependencies,
        ...INIT_REACT_PACKAGE_JSON_DEPENDENCIES,
      },
      devDependencies: {
        ...existing.devDependencies,
        ...getInitReactPackageJsonDevDependencies(options),
      },
    },
    null,
    2
  )}\n`;
}
