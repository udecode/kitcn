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
};

const INIT_NEXT_PACKAGE_JSON_SCRIPTS = {
  dev: 'next dev --turbopack',
  build: 'next build',
  start: 'next start',
  lint: 'eslint',
  format: 'prettier --write "**/*.{ts,tsx}"',
  typecheck: 'tsc --noEmit && bun run typecheck:convex',
} as const;

const INIT_NEXT_CODEGEN_SCRIPT = 'better-convex codegen';
const INIT_NEXT_PRIMARY_CODEGEN_SCRIPT_NAME = 'codegen';
const INIT_NEXT_FALLBACK_CODEGEN_SCRIPT_NAME = 'convex:codegen';
const INIT_NEXT_CONVEX_DEV_SCRIPT_NAME = 'convex:dev';
const INIT_NEXT_CONVEX_DEV_SCRIPT = 'better-convex dev';
const INIT_NEXT_CONVEX_TYPECHECK_SCRIPT_NAME = 'typecheck:convex';
const INIT_NEXT_CONVEX_TYPECHECK_SCRIPT =
  'tsc --noEmit --project convex/tsconfig.json';

const INIT_NEXT_PACKAGE_JSON_DEPENDENCIES = {
  superjson: '2.2.6',
} as const;

const INIT_NEXT_PACKAGE_JSON_DEV_DEPENDENCIES = {
  '@types/bun': 'latest',
} as const;

const getInitNextPackageJsonDevDependencies = (
  options: InitPackageJsonTemplateOptions
) => ({
  ...INIT_NEXT_PACKAGE_JSON_DEV_DEPENDENCIES,
  ...(options.backend === 'concave'
    ? {
        '@concavejs/cli': 'latest',
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
      INIT_NEXT_CONVEX_TYPECHECK_SCRIPT;
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
        ...getInitNextPackageJsonDevDependencies(options),
      },
    },
    null,
    2
  )}\n`;
}
