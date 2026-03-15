import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  generateFreshApp,
  installLocalBetterConvex,
  log,
  normalizeEnvLocal,
  PROJECT_ROOT,
  packLocalBetterConvexPackage,
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
  path.join(PROJECT_ROOT, 'templates', templateKey);

const getFixturePackageName = (templateKey: TemplateKey) =>
  `better-convex-template-${templateKey}`;

const getValidationPackageName = (templateKey: TemplateKey) =>
  `${getFixturePackageName(templateKey)}-check`;

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
      'Usage: bun tooling/templates.ts <sync|check> [all|next|next-auth|vite|vite-auth] [--backend <convex|concave>]'
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
    logFn?: typeof log;
    normalizeTemplateFn?: typeof normalizeTemplateSnapshot;
  } = {}
) => {
  const generateTemplateFn = params.generateTemplateFn ?? generateTemplate;
  const normalizeTemplateFn =
    params.normalizeTemplateFn ?? normalizeTemplateSnapshot;
  const fixtureDir = getTemplateFixtureDir(templateKey);
  const { generatedAppDir, tempRoot } = await generateTemplateFn(templateKey, {
    backend: params.backend,
  });

  try {
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
      `${path.relative(PROJECT_ROOT, fixtureDir)} is missing. Run \`bun run template:sync\` first.`
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
        'Template drift detected. Run `bun run template:sync` and commit the updated fixtures.'
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
