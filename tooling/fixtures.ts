import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {
  generateFreshApp,
  installLocalPackage,
  log,
  normalizeEnvLocal,
  PROJECT_ROOT,
  packLocalPackage,
  patchPreparedLocalDevPort,
  readJson,
  run,
  runAppValidation,
  runLocalCliSteps,
  stripVolatileArtifacts,
  type WorkspacePackageJson,
  writeJson,
} from './scaffold-utils';
import {
  TEMPLATE_DEFINITIONS,
  TEMPLATE_KEYS,
  type TemplateBackend,
  type TemplateKey,
} from './template.config';

export type TemplateTarget = 'all' | TemplateKey;
export type FixtureCheckScope = 'owned' | 'full';

const VALID_TEMPLATE_BACKENDS = new Set(['convex', 'concave'] as const);
const VALID_FIXTURE_CHECK_SCOPES = new Set(['owned', 'full'] as const);
const DEFAULT_FIXTURE_CHECK_SCOPE = 'owned' satisfies FixtureCheckScope;

const getTemplateFixtureDir = (templateKey: TemplateKey) =>
  path.join(PROJECT_ROOT, 'fixtures', templateKey);

const getFixturePackageName = (templateKey: TemplateKey) =>
  `kitcn-template-${templateKey}`;

const getValidationPackageName = (templateKey: TemplateKey) =>
  `${getFixturePackageName(templateKey)}-check`;

const getGeneratedAppName = (templateKey: TemplateKey) =>
  TEMPLATE_DEFINITIONS[templateKey].initTemplate === 'expo'
    ? 'kitcn-expo'
    : TEMPLATE_DEFINITIONS[templateKey].initTemplate;

const FIXTURE_TSCONFIG_FILES = [
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  path.join('convex', 'functions', 'tsconfig.json'),
  path.join('convex', 'tsconfig.json'),
] as const;

const FIXTURE_PACKAGE_PATHS = {
  'kitcn/aggregate': 'src/aggregate/index.ts',
  'kitcn/auth': 'src/auth/index.ts',
  'kitcn/auth/client': 'src/auth-client/index.ts',
  'kitcn/auth/config': 'src/auth-config/index.ts',
  'kitcn/auth/generated': 'src/auth/generated.ts',
  'kitcn/auth/http': 'src/auth-http/index.ts',
  'kitcn/auth/nextjs': 'src/auth-nextjs/index.ts',
  'kitcn/auth/start': 'src/auth-start/index.ts',
  'kitcn/auth/start/server': 'src/auth-start/server.ts',
  'kitcn/crpc': 'src/crpc/index.ts',
  'kitcn/orm': 'src/orm/index.ts',
  'kitcn/plugins': 'src/plugins/index.ts',
  'kitcn/ratelimit': 'src/ratelimit/index.ts',
  'kitcn/ratelimit/react': 'src/ratelimit/react/index.ts',
  'kitcn/react': 'src/react/index.ts',
  'kitcn/rsc': 'src/rsc/index.ts',
  'kitcn/server': 'src/server/index.ts',
  'kitcn/solid': 'src/solid/index.ts',
} as const;

const VOLATILE_FIXTURE_DEPENDENCY_SPECS = {
  shadcn: 'latest',
} as const;

const VOLATILE_FIXTURE_COMPARISON_DIRS = [
  path.join('components', 'ui'),
  path.join('src', 'components', 'ui'),
] as const;

const SHADCN_TEMPLATE_KEYS = new Set<TemplateKey>([
  'next',
  'next-auth',
  'start',
  'start-auth',
  'vite',
  'vite-auth',
]);

const getProjectPackageManager = () =>
  readJson<WorkspacePackageJson>(path.join(PROJECT_ROOT, 'package.json'))
    .packageManager;

const normalizeTemplatePackageJson = (
  packageJson: WorkspacePackageJson,
  templateKey: TemplateKey
): WorkspacePackageJson => ({
  dependencies: {
    ...packageJson.dependencies,
    kitcn: 'workspace:*',
    ...Object.fromEntries(
      Object.entries(VOLATILE_FIXTURE_DEPENDENCY_SPECS).filter(
        ([dependencyName]) => packageJson.dependencies?.[dependencyName]
      )
    ),
  },
  main: packageJson.main,
  devDependencies: packageJson.devDependencies,
  name: getFixturePackageName(templateKey),
  packageManager: getProjectPackageManager(),
  private: packageJson.private ?? true,
  scripts: packageJson.scripts,
  type: packageJson.type,
  version: packageJson.version,
});

const stripFixtureSnapshotArtifacts = (directory: string) => {
  rmSync(path.join(directory, '.env.local'), { force: true });
};

export const stripFixtureComparisonArtifacts = (
  directory: string,
  templateKey: TemplateKey,
  scope: FixtureCheckScope = DEFAULT_FIXTURE_CHECK_SCOPE
) => {
  stripFixtureSnapshotArtifacts(directory);

  if (scope === 'full' || !SHADCN_TEMPLATE_KEYS.has(templateKey)) {
    return;
  }

  for (const relativeDir of VOLATILE_FIXTURE_COMPARISON_DIRS) {
    rmSync(path.join(directory, relativeDir), {
      force: true,
      recursive: true,
    });
  }
};

export const normalizeFixtureComparisonPackageJson = (directory: string) => {
  const packageJsonPath = path.join(directory, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return;
  }

  const packageJson = readJson<WorkspacePackageJson>(packageJsonPath);
  const packageManager = getProjectPackageManager();
  const {
    dependencies,
    devDependencies,
    main,
    name,
    packageManager: _packageManager,
    private: isPrivate,
    scripts,
    type,
    version,
    ...rest
  } = packageJson;

  writeJson(packageJsonPath, {
    dependencies,
    main,
    devDependencies,
    name,
    packageManager,
    private: isPrivate,
    scripts,
    type,
    version,
    ...rest,
  });
};

export const normalizeTemplateSnapshot = (
  directory: string,
  templateKey: TemplateKey
) => {
  stripVolatileArtifacts(directory);
  writeJson(
    path.join(directory, 'package.json'),
    normalizeTemplatePackageJson(
      readJson<WorkspacePackageJson>(path.join(directory, 'package.json')),
      templateKey
    )
  );
  normalizeEnvLocal(directory);
  patchPreparedLocalDevPort(directory);
  patchFixtureTsconfigPaths(directory, getTemplateFixtureDir(templateKey));
  stripFixtureSnapshotArtifacts(directory);
};

type TsconfigJson = {
  compilerOptions?: {
    paths?: Record<string, string[]>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

const patchFixtureTsconfigPaths = (
  directory: string,
  snapshotDirectory: string
) => {
  for (const relativeTsconfigPath of FIXTURE_TSCONFIG_FILES) {
    const tsconfigPath = path.join(directory, relativeTsconfigPath);
    if (!existsSync(tsconfigPath)) {
      continue;
    }

    const parsedTsconfig = ts.parseConfigFileTextToJson(
      tsconfigPath,
      readFileSync(tsconfigPath, 'utf8')
    );
    if (parsedTsconfig.error) {
      throw new Error(
        `Failed to parse ${path.relative(PROJECT_ROOT, tsconfigPath)}.`
      );
    }
    const tsconfig = (parsedTsconfig.config ?? {}) as TsconfigJson;
    const compilerOptions = tsconfig.compilerOptions ?? {};
    const paths = compilerOptions.paths ?? {};
    const snapshotTsconfigDir = path.dirname(
      path.join(snapshotDirectory, relativeTsconfigPath)
    );

    for (const [specifier, sourcePath] of Object.entries(
      FIXTURE_PACKAGE_PATHS
    )) {
      const relativeSourcePath = path
        .relative(
          snapshotTsconfigDir,
          path.join(PROJECT_ROOT, 'packages', 'kitcn', sourcePath)
        )
        .replaceAll(path.sep, '/');
      paths[specifier] = [
        relativeSourcePath.startsWith('.')
          ? relativeSourcePath
          : `./${relativeSourcePath}`,
      ];
    }

    writeJson(tsconfigPath, {
      ...tsconfig,
      compilerOptions: {
        ...compilerOptions,
        paths,
      },
    });
  }
};

export const parseTemplateArgs = (
  argv: string[]
): {
  backend: TemplateBackend;
  mode: 'sync' | 'check';
  scope: FixtureCheckScope;
  target: TemplateTarget;
} => {
  const [mode, ...rest] = argv;
  if (mode !== 'sync' && mode !== 'check') {
    throw new Error(
      'Usage: bun tooling/fixtures.ts <sync|check> [all|expo|expo-auth|next|next-auth|start|start-auth|vite|vite-auth] [--backend <convex|concave>]'
    );
  }

  let backend: TemplateBackend = 'concave';
  let scope = DEFAULT_FIXTURE_CHECK_SCOPE;
  let target: TemplateTarget = 'all';

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--backend') {
      const value = rest[index + 1];
      if (!value || !VALID_TEMPLATE_BACKENDS.has(value as TemplateBackend)) {
        throw new Error(
          `Invalid --backend value "${value ?? ''}". Expected one of: convex, concave.`
        );
      }
      backend = value as TemplateBackend;
      index += 1;
      continue;
    }

    if (arg === '--scope') {
      const value = rest[index + 1];
      if (
        !value ||
        !VALID_FIXTURE_CHECK_SCOPES.has(value as FixtureCheckScope)
      ) {
        throw new Error(
          `Invalid --scope value "${value ?? ''}". Expected one of: owned, full.`
        );
      }
      scope = value as FixtureCheckScope;
      index += 1;
      continue;
    }

    if (arg === 'all' || TEMPLATE_KEYS.includes(arg as TemplateKey)) {
      target = arg as TemplateTarget;
      continue;
    }

    throw new Error(`Unknown template target "${arg}".`);
  }

  return { backend, mode, scope, target };
};

export const resolveTemplateKeys = (target: TemplateTarget = 'all') =>
  target === 'all' ? [...TEMPLATE_KEYS] : [target];

export const generateTemplate = async (
  templateKey: TemplateKey,
  params: {
    backend?: TemplateBackend;
    localCliPath?: string;
    projectRoot?: string;
    runCommand?: typeof run;
  } = {}
) => {
  const definition = TEMPLATE_DEFINITIONS[templateKey];
  const backend = params.backend ?? 'concave';
  const generatedAppName = getGeneratedAppName(templateKey);
  const runCommand = params.runCommand ?? run;
  const { generatedAppDir, tempRoot } = await generateFreshApp({
    backend,
    generatedAppName,
    initTemplate: definition.initTemplate,
    localCliPath: params.localCliPath,
    projectRoot: params.projectRoot,
    runCommand,
  });

  await runLocalCliSteps(definition.setup, generatedAppDir, {
    backend,
    localCliPath: params.localCliPath,
    runCommand,
  });

  return { generatedAppDir, tempRoot };
};

export const syncTemplate = async (
  templateKey: TemplateKey,
  params: {
    backend?: TemplateBackend;
    generateTemplateFn?: typeof generateTemplate;
    installLocalPackageFn?: typeof installLocalPackage;
    logFn?: typeof log;
    normalizeTemplateFn?: typeof normalizeTemplateSnapshot;
    runCommand?: typeof run;
    validateAppFn?: typeof runAppValidation;
  } = {}
) => {
  const generateTemplateFn = params.generateTemplateFn ?? generateTemplate;
  const normalizeTemplateFn =
    params.normalizeTemplateFn ?? normalizeTemplateSnapshot;
  const runCommand = params.runCommand ?? run;
  const fixtureDir = getTemplateFixtureDir(templateKey);
  const { generatedAppDir, tempRoot } = await generateTemplateFn(templateKey, {
    backend: params.backend,
  });

  try {
    const kitcnPackageSpec = packLocalPackage(tempRoot);
    await (params.installLocalPackageFn ?? installLocalPackage)(
      generatedAppDir,
      {
        kitcnPackageSpec,
        runCommand,
      }
    );
    await (params.validateAppFn ?? runAppValidation)(
      generatedAppDir,
      runCommand,
      {
        lint: TEMPLATE_DEFINITIONS[templateKey].validation.lint,
      }
    );
    normalizeTemplateFn(generatedAppDir, templateKey);
    mkdirSync(path.dirname(fixtureDir), { recursive: true });
    rmSync(fixtureDir, { recursive: true, force: true });
    cpSync(generatedAppDir, fixtureDir, { recursive: true });
    (params.logFn ?? log)(`Synced ${path.relative(PROJECT_ROOT, fixtureDir)}.`);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
};

export const syncTemplates = async (
  params: {
    backend?: TemplateBackend;
    syncTemplateFn?: typeof syncTemplate;
    target?: TemplateTarget;
  } = {}
) => {
  const syncTemplateFn = params.syncTemplateFn ?? syncTemplate;
  for (const templateKey of resolveTemplateKeys(params.target)) {
    await syncTemplateFn(templateKey, {
      backend: params.backend,
    });
  }
};

export const checkTemplate = async (
  templateKey: TemplateKey,
  params: {
    backend?: TemplateBackend;
    generateTemplateFn?: typeof generateTemplate;
    logFn?: typeof log;
    normalizeTemplateFn?: typeof normalizeTemplateSnapshot;
    projectRoot?: string;
    runCommand?: typeof run;
    scope?: FixtureCheckScope;
    validateAppFn?: typeof runAppValidation;
  } = {}
) => {
  const fixtureDir = getTemplateFixtureDir(templateKey);
  if (!existsSync(fixtureDir)) {
    throw new Error(
      `${path.relative(PROJECT_ROOT, fixtureDir)} is missing. Run \`bun run fixtures:sync\` first.`
    );
  }

  const generateTemplateFn = params.generateTemplateFn ?? generateTemplate;
  const normalizeTemplateFn =
    params.normalizeTemplateFn ?? normalizeTemplateSnapshot;
  const runCommand = params.runCommand ?? run;
  const { generatedAppDir, tempRoot } = await generateTemplateFn(templateKey, {
    backend: params.backend ?? 'concave',
  });

  try {
    const kitcnPackageSpec = packLocalPackage(tempRoot);
    await installLocalPackage(generatedAppDir, {
      kitcnPackageSpec,
      packageName: getValidationPackageName(templateKey),
      runCommand,
    });
    await (params.validateAppFn ?? runAppValidation)(
      generatedAppDir,
      runCommand,
      {
        lint: TEMPLATE_DEFINITIONS[templateKey].validation.lint,
      }
    );
    normalizeTemplateFn(generatedAppDir, templateKey);

    const fixtureDiffDir = path.join(tempRoot, '__fixture__');
    cpSync(fixtureDir, fixtureDiffDir, { recursive: true });
    stripVolatileArtifacts(fixtureDiffDir);
    normalizeFixtureComparisonPackageJson(fixtureDiffDir);
    stripFixtureComparisonArtifacts(
      fixtureDiffDir,
      templateKey,
      params.scope ?? DEFAULT_FIXTURE_CHECK_SCOPE
    );
    stripFixtureComparisonArtifacts(
      generatedAppDir,
      templateKey,
      params.scope ?? DEFAULT_FIXTURE_CHECK_SCOPE
    );

    const diffExitCode = await runCommand(
      [
        'git',
        '--no-pager',
        'diff',
        '--no-index',
        '--no-ext-diff',
        '--',
        fixtureDiffDir,
        generatedAppDir,
      ],
      params.projectRoot ?? PROJECT_ROOT,
      {
        allowNonZeroExit: true,
      }
    );

    if (diffExitCode === 0) {
      (params.logFn ?? log)(TEMPLATE_DEFINITIONS[templateKey].successMessage);
      return;
    }

    if (diffExitCode === 1) {
      (params.logFn ?? log)('');
      (params.logFn ?? log)(
        'Fixture drift detected. Run `bun run fixtures:sync` and commit the updated snapshots.'
      );
      process.exit(1);
    }

    process.exit(diffExitCode);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
};

export const checkTemplates = async (
  params: {
    backend?: TemplateBackend;
    checkTemplateFn?: (
      templateKey: TemplateKey,
      params?: {
        backend?: TemplateBackend;
        scope?: FixtureCheckScope;
      }
    ) => Promise<void>;
    scope?: FixtureCheckScope;
    target?: TemplateTarget;
  } = {}
) => {
  const checkTemplateFn = params.checkTemplateFn ?? checkTemplate;
  for (const templateKey of resolveTemplateKeys(params.target)) {
    await checkTemplateFn(templateKey, {
      backend: params.backend,
      scope: params.scope ?? DEFAULT_FIXTURE_CHECK_SCOPE,
    });
  }
};

const main = async () => {
  const { backend, mode, scope, target } = parseTemplateArgs(
    process.argv.slice(2)
  );

  if (mode === 'sync') {
    await syncTemplates({ backend, target });
    return;
  }

  await checkTemplates({ backend, scope, target });
};

if (import.meta.main) {
  await main();
}
