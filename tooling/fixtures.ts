import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {
  generateFreshApp,
  installLocalBetterConvex,
  log,
  normalizeEnvLocal,
  PROJECT_ROOT,
  packLocalBetterConvexPackage,
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

const VALID_TEMPLATE_BACKENDS = new Set(['convex', 'concave'] as const);

const getTemplateFixtureDir = (templateKey: TemplateKey) =>
  path.join(PROJECT_ROOT, 'fixtures', templateKey);

const getFixturePackageName = (templateKey: TemplateKey) =>
  `better-convex-template-${templateKey}`;

const getValidationPackageName = (templateKey: TemplateKey) =>
  `${getFixturePackageName(templateKey)}-check`;

const FIXTURE_TSCONFIG_FILES = [
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  path.join('convex', 'functions', 'tsconfig.json'),
  path.join('convex', 'tsconfig.json'),
] as const;

const FIXTURE_PACKAGE_PATHS = {
  'better-convex/aggregate': 'src/aggregate/index.ts',
  'better-convex/auth': 'src/auth/index.ts',
  'better-convex/auth/client': 'src/auth-client/index.ts',
  'better-convex/auth/config': 'src/auth-config/index.ts',
  'better-convex/auth/generated': 'src/auth/generated.ts',
  'better-convex/auth/http': 'src/auth-http/index.ts',
  'better-convex/auth/nextjs': 'src/auth-nextjs/index.ts',
  'better-convex/crpc': 'src/crpc/index.ts',
  'better-convex/orm': 'src/orm/index.ts',
  'better-convex/plugins': 'src/plugins/index.ts',
  'better-convex/ratelimit': 'src/ratelimit/index.ts',
  'better-convex/ratelimit/react': 'src/ratelimit/react/index.ts',
  'better-convex/react': 'src/react/index.ts',
  'better-convex/rsc': 'src/rsc/index.ts',
  'better-convex/server': 'src/server/index.ts',
  'better-convex/solid': 'src/solid/index.ts',
} as const;

const normalizeTemplatePackageJson = (
  packageJson: WorkspacePackageJson,
  templateKey: TemplateKey
): WorkspacePackageJson => ({
  dependencies: {
    ...packageJson.dependencies,
    'better-convex': 'workspace:*',
  },
  devDependencies: packageJson.devDependencies,
  name: getFixturePackageName(templateKey),
  packageManager: packageJson.packageManager,
  private: packageJson.private ?? true,
  scripts: packageJson.scripts,
  type: packageJson.type,
  version: packageJson.version,
});

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
          path.join(PROJECT_ROOT, 'packages', 'better-convex', sourcePath)
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
  target: TemplateTarget;
} => {
  const [mode, ...rest] = argv;
  if (mode !== 'sync' && mode !== 'check') {
    throw new Error(
      'Usage: bun tooling/fixtures.ts <sync|check> [all|next|next-auth|vite|vite-auth] [--backend <convex|concave>]'
    );
  }

  let backend: TemplateBackend = 'concave';
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

    if (arg === 'all' || TEMPLATE_KEYS.includes(arg as TemplateKey)) {
      target = arg as TemplateTarget;
      continue;
    }

    throw new Error(`Unknown template target "${arg}".`);
  }

  return { backend, mode, target };
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
  const generatedAppName = definition.initTemplate;
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
    installLocalBetterConvexFn?: typeof installLocalBetterConvex;
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
    const betterConvexPackageSpec = packLocalBetterConvexPackage(tempRoot);
    await (params.installLocalBetterConvexFn ?? installLocalBetterConvex)(
      generatedAppDir,
      {
        betterConvexPackageSpec,
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
    const betterConvexPackageSpec = packLocalBetterConvexPackage(tempRoot);
    await installLocalBetterConvex(generatedAppDir, {
      betterConvexPackageSpec,
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
      }
    ) => Promise<void>;
    target?: TemplateTarget;
  } = {}
) => {
  const checkTemplateFn = params.checkTemplateFn ?? checkTemplate;
  for (const templateKey of resolveTemplateKeys(params.target)) {
    await checkTemplateFn(templateKey, {
      backend: params.backend,
    });
  }
};

const main = async () => {
  const { backend, mode, target } = parseTemplateArgs(process.argv.slice(2));

  if (mode === 'sync') {
    await syncTemplates({ backend, target });
    return;
  }

  await checkTemplates({ backend, target });
};

if (import.meta.main) {
  await main();
}
