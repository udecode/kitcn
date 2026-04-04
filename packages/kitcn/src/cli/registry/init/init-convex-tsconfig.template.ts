import path from 'node:path';

const getConvexDirRelative = (functionsDirRelative: string) =>
  path.posix.basename(functionsDirRelative) === 'functions'
    ? path.posix.dirname(functionsDirRelative)
    : functionsDirRelative;

const getRelativeGlob = (
  fromDirRelative: string,
  targetDirRelative: string
): string => {
  const relativeDir = path.posix.relative(fromDirRelative, targetDirRelative);
  return relativeDir.length > 0 ? `${relativeDir}/**/*` : './**/*';
};

export function renderInitConvexTsconfigTemplate(
  functionsDirRelative = 'convex/functions'
): string {
  const normalizedFunctionsDir = functionsDirRelative.replaceAll('\\', '/');
  const convexDirRelative = getConvexDirRelative(normalizedFunctionsDir);
  const include = [
    './**/*',
    getRelativeGlob(
      normalizedFunctionsDir,
      path.posix.join(convexDirRelative, 'lib')
    ),
    getRelativeGlob(
      normalizedFunctionsDir,
      path.posix.join(convexDirRelative, 'shared')
    ),
  ];

  return `${JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/tsconfig',
      compilerOptions: {
        strict: true,
        strictFunctionTypes: false,
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        isolatedModules: true,
        skipLibCheck: true,
        noUnusedLocals: false,
        noUnusedParameters: false,
        noEmit: true,
        jsx: 'react-jsx',
        lib: ['esnext', 'dom'],
        types: ['bun-types'],
        target: 'esnext',
        moduleDetection: 'force',
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        allowJs: true,
      },
      include,
      exclude: ['node_modules', './_generated', '**/*.spec.ts', '**/*.test.ts'],
    },
    null,
    2
  )}\n`;
}

export const INIT_CONVEX_TSCONFIG_TEMPLATE = renderInitConvexTsconfigTemplate();
