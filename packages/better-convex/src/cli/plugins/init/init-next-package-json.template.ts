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

const INIT_NEXT_PACKAGE_JSON_SCRIPTS = {
  dev: 'next dev --turbopack',
  build: 'next build',
  start: 'next start',
  lint: 'eslint',
  format: 'prettier --write "**/*.{ts,tsx}"',
  typecheck: 'tsc --noEmit',
} as const;

const INIT_NEXT_CODEGEN_SCRIPT = 'better-convex codegen';
const INIT_NEXT_PRIMARY_CODEGEN_SCRIPT_NAME = 'codegen';
const INIT_NEXT_FALLBACK_CODEGEN_SCRIPT_NAME = 'convex:codegen';

const INIT_NEXT_PACKAGE_JSON_DEPENDENCIES = {
  superjson: '2.2.6',
} as const;

export function renderInitNextPackageJsonTemplate(source?: string): string {
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

  return `${JSON.stringify(
    {
      ...existing,
      scripts: nextScripts,
      dependencies: {
        ...existing.dependencies,
        ...INIT_NEXT_PACKAGE_JSON_DEPENDENCIES,
      },
    },
    null,
    2
  )}\n`;
}
