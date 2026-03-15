import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  buildLocalCliCommand,
  generateFreshApp,
  installLocalBetterConvex,
  LOCAL_CLI_PATH,
  log,
  normalizeEnvLocal,
  PROJECT_ROOT,
  packLocalBetterConvexPackage,
  readJson,
  run,
  runAppValidation,
  runLocalCliSteps,
  runPackageScriptIfPresent,
  stripVolatileArtifacts,
  type WorkspacePackageJson,
} from './scaffold-utils';
import {
  SCENARIO_DEFINITIONS,
  SCENARIO_KEYS,
  type ScenarioKey,
} from './scenario.config';
import type { TemplateBackend } from './template.config';

export type ScenarioMode =
  | 'materialize'
  | 'check'
  | 'typecheck'
  | 'codegen'
  | 'dev';

export type ScenarioTarget = 'all' | ScenarioKey;

const DEFAULT_OUTPUT_ROOT = path.join(PROJECT_ROOT, 'tmp', 'scenarios');
const SCENARIO_FIXTURE_ROOT = path.join(
  PROJECT_ROOT,
  'tooling',
  'scenario-fixtures'
);
const LOCALHOST_PORT_RE = /https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)/;
const PID_SPLIT_RE = /\s+/;
const CLEARED_CONVEX_ENV = {
  CONVEX_DEPLOYMENT: undefined,
  CONVEX_DEPLOY_KEY: undefined,
  CONVEX_SELF_HOSTED_URL: undefined,
  CONVEX_SELF_HOSTED_ADMIN_KEY: undefined,
} as const;

const getScenarioDir = (
  scenarioKey: ScenarioKey,
  outputRoot = DEFAULT_OUTPUT_ROOT
) => path.join(outputRoot, scenarioKey);

const getScenarioProjectDir = (
  scenarioKey: ScenarioKey,
  outputRoot = DEFAULT_OUTPUT_ROOT
) => path.join(getScenarioDir(scenarioKey, outputRoot), 'project');

const getScenarioMetadataDir = (
  scenarioKey: ScenarioKey,
  outputRoot = DEFAULT_OUTPUT_ROOT
) =>
  path.join(getScenarioDir(scenarioKey, outputRoot), '.better-convex-scenario');

const getTemplateFixtureDir = (templateKey: string) =>
  path.join(PROJECT_ROOT, 'templates', templateKey);

const extractLocalConvexPort = (projectDir: string) => {
  const envLocalPath = path.join(projectDir, '.env.local');
  if (!existsSync(envLocalPath)) {
    return undefined;
  }

  const match = readFileSync(envLocalPath, 'utf8').match(LOCALHOST_PORT_RE);
  return match?.[1];
};

const stopLocalConvexBackendForProject = (projectDir: string) => {
  const port = extractLocalConvexPort(projectDir);
  if (!port) {
    return;
  }

  const result = Bun.spawnSync({
    cmd: ['lsof', '-ti', `tcp:${port}`],
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore',
  });
  if (result.exitCode !== 0) {
    return;
  }

  const pids = result.stdout
    .toString()
    .split(PID_SPLIT_RE)
    .map((pid) => pid.trim())
    .filter(Boolean);
  if (pids.length === 0) {
    return;
  }

  Bun.spawnSync({
    cmd: ['kill', '-9', ...pids],
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
  });
};

const stopScenarioBackends = (outputRoot = DEFAULT_OUTPUT_ROOT) => {
  if (!existsSync(outputRoot)) {
    return;
  }

  for (const entry of readdirSync(outputRoot)) {
    stopLocalConvexBackendForProject(path.join(outputRoot, entry, 'project'));
  }
};

const resolveScenarioKeys = (target: ScenarioTarget = 'all') =>
  target === 'all' ? [...SCENARIO_KEYS] : [target];

const getScenarioBackend = (
  scenarioKey: ScenarioKey,
  backend?: TemplateBackend
) => SCENARIO_DEFINITIONS[scenarioKey].backend ?? backend ?? 'concave';

const createScenarioRunCommand = (
  scenarioKey: ScenarioKey,
  baseRunCommand: typeof run
) => {
  const scenarioEnv = SCENARIO_DEFINITIONS[scenarioKey].env;
  if (!scenarioEnv) {
    return baseRunCommand;
  }
  const scenarioHome =
    scenarioEnv.CONVEX_AGENT_MODE === 'anonymous'
      ? path.join(PROJECT_ROOT, 'tmp', 'scenario-homes', scenarioKey)
      : undefined;

  return (
    cmd: string[],
    cwd: string,
    options: Parameters<typeof run>[2] = {}
  ) =>
    baseRunCommand(cmd, cwd, {
      ...options,
      env: {
        ...CLEARED_CONVEX_ENV,
        ...(scenarioHome
          ? {
              HOME: scenarioHome,
            }
          : {}),
        ...scenarioEnv,
        ...options.env,
      },
    });
};

const resolveScenarioCommand = (
  step: readonly string[],
  params: {
    backend: TemplateBackend;
    projectDir: string;
  }
) => {
  const [command, ...rest] = step;
  if (!command) {
    throw new Error('Scenario step cannot be empty.');
  }

  if (command === 'better-convex') {
    return buildLocalCliCommand(rest, {
      backend: params.backend,
      localCliPath: LOCAL_CLI_PATH,
    });
  }

  if (command === 'convex') {
    const convexBin = path.join(
      params.projectDir,
      'node_modules',
      '.bin',
      'convex'
    );
    if (!existsSync(convexBin)) {
      throw new Error(
        `Missing convex binary for scenario in ${params.projectDir}.`
      );
    }
    return [convexBin, ...rest];
  }

  return [...step];
};

const runScenarioCommands = async (
  steps: ReadonlyArray<readonly string[]>,
  params: {
    backend: TemplateBackend;
    projectDir: string;
    runCommand: typeof run;
  }
) => {
  for (const step of steps) {
    await params.runCommand(
      resolveScenarioCommand(step, {
        backend: params.backend,
        projectDir: params.projectDir,
      }),
      params.projectDir
    );
  }
};

export const resolveScenarioKeysForCheck = () =>
  SCENARIO_KEYS.filter(
    (scenarioKey) => SCENARIO_DEFINITIONS[scenarioKey].check
  );

export const parseScenarioArgs = (
  argv: string[]
): {
  mode: ScenarioMode;
  target: ScenarioTarget;
} => {
  const [mode, targetArg] = argv;
  if (
    mode !== 'materialize' &&
    mode !== 'check' &&
    mode !== 'typecheck' &&
    mode !== 'codegen' &&
    mode !== 'dev'
  ) {
    throw new Error(
      `Usage: bun tooling/scenarios.ts <materialize|check|typecheck|codegen|dev> [all|${SCENARIO_KEYS.join('|')}]`
    );
  }

  if (mode === 'dev' && !targetArg) {
    throw new Error('scenario dev requires a specific scenario target.');
  }

  const target = (targetArg ?? 'all') as ScenarioTarget;
  if (target !== 'all' && !SCENARIO_KEYS.includes(target as ScenarioKey)) {
    throw new Error(`Unknown scenario target "${target}".`);
  }

  return { mode, target };
};

const writeScenarioMetadata = (
  scenarioKey: ScenarioKey,
  outputRoot: string,
  params: {
    betterConvexPackageSpec: string;
    backend: TemplateBackend;
    source: unknown;
    steps: ReadonlyArray<readonly string[]>;
  }
) => {
  const metadataDir = getScenarioMetadataDir(scenarioKey, outputRoot);
  mkdirSync(metadataDir, { recursive: true });
  writeFileSync(
    path.join(metadataDir, 'scenario.json'),
    `${JSON.stringify(
      {
        betterConvexPackageSpec: params.betterConvexPackageSpec,
        backend: params.backend,
        name: scenarioKey,
        source: params.source,
        steps: params.steps,
      },
      null,
      2
    )}\n`
  );
};

const materializeScenarioSource = async (
  scenarioKey: ScenarioKey,
  params: {
    backend?: TemplateBackend;
    outputRoot?: string;
    runCommand?: typeof run;
  } = {}
) => {
  const scenario = SCENARIO_DEFINITIONS[scenarioKey];
  const outputRoot = params.outputRoot ?? DEFAULT_OUTPUT_ROOT;
  const scenarioDir = getScenarioDir(scenarioKey, outputRoot);
  const projectDir = getScenarioProjectDir(scenarioKey, outputRoot);
  const metadataDir = getScenarioMetadataDir(scenarioKey, outputRoot);
  const runCommand = params.runCommand ?? run;
  const backend = getScenarioBackend(scenarioKey, params.backend);
  stopLocalConvexBackendForProject(projectDir);

  rmSync(scenarioDir, { force: true, recursive: true });
  mkdirSync(metadataDir, { recursive: true });

  if (scenario.source.kind === 'template') {
    cpSync(getTemplateFixtureDir(scenario.source.template), projectDir, {
      recursive: true,
    });
  } else if (scenario.source.kind === 'fixture') {
    cpSync(
      path.join(SCENARIO_FIXTURE_ROOT, scenario.source.fixture),
      projectDir,
      {
        recursive: true,
      }
    );
  } else {
    const { generatedAppDir, tempRoot } = await generateFreshApp({
      backend,
      generatedAppName: scenario.source.template,
      initTemplate: scenario.source.template,
      runCommand,
    });

    try {
      cpSync(generatedAppDir, projectDir, { recursive: true });
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  }

  stripVolatileArtifacts(projectDir);
  normalizeEnvLocal(projectDir);

  await runLocalCliSteps(scenario.setup, projectDir, {
    backend,
    localCliPath: LOCAL_CLI_PATH,
    runCommand,
  });

  const betterConvexPackageSpec = packLocalBetterConvexPackage(metadataDir);
  await installLocalBetterConvex(projectDir, {
    betterConvexPackageSpec,
    runCommand,
  });
  writeScenarioMetadata(scenarioKey, outputRoot, {
    betterConvexPackageSpec,
    backend,
    source: scenario.source,
    steps: scenario.setup,
  });

  return { metadataDir, projectDir, scenarioDir };
};

export const materializeScenario = async (
  scenarioKey: ScenarioKey,
  params: {
    backend?: TemplateBackend;
    logFn?: typeof log;
    outputRoot?: string;
    runCommand?: typeof run;
  } = {}
) => {
  const runCommand = createScenarioRunCommand(
    scenarioKey,
    params.runCommand ?? run
  );
  const { projectDir } = await materializeScenarioSource(scenarioKey, {
    ...params,
    runCommand,
  });
  (params.logFn ?? log)(
    `Materialized ${scenarioKey} -> ${path.relative(PROJECT_ROOT, projectDir)}`
  );
  return projectDir;
};

export const materializeScenarios = async (
  params: {
    backend?: TemplateBackend;
    materializeScenarioFn?: typeof materializeScenario;
    outputRoot?: string;
    target?: ScenarioTarget;
  } = {}
) => {
  const materializeScenarioFn =
    params.materializeScenarioFn ?? materializeScenario;

  for (const scenarioKey of resolveScenarioKeys(params.target)) {
    await materializeScenarioFn(scenarioKey, {
      backend: params.backend,
      outputRoot: params.outputRoot,
    });
  }
};

export const checkScenario = async (
  scenarioKey: ScenarioKey,
  params: {
    backend?: TemplateBackend;
    logFn?: typeof log;
    outputRoot?: string;
    runCommand?: typeof run;
    validateAppFn?: typeof runAppValidation;
  } = {}
) => {
  const runCommand = createScenarioRunCommand(
    scenarioKey,
    params.runCommand ?? run
  );
  const backend = getScenarioBackend(scenarioKey, params.backend);
  stopScenarioBackends(params.outputRoot);
  const { projectDir } = await materializeScenarioSource(scenarioKey, {
    ...params,
    backend,
    runCommand,
  });
  try {
    await runScenarioCommands(
      SCENARIO_DEFINITIONS[scenarioKey].validation.beforeCheck ?? [],
      {
        backend,
        projectDir,
        runCommand,
      }
    );
    await (params.validateAppFn ?? runAppValidation)(projectDir, runCommand, {
      lint: SCENARIO_DEFINITIONS[scenarioKey].validation.lint,
    });
    (params.logFn ?? log)(
      `${SCENARIO_DEFINITIONS[scenarioKey].label} scenario validated.`
    );
  } finally {
    stopLocalConvexBackendForProject(projectDir);
    stopScenarioBackends(params.outputRoot);
  }
};

export const checkScenarios = async (
  params: {
    backend?: TemplateBackend;
    checkScenarioFn?: (
      scenarioKey: ScenarioKey,
      params?: {
        backend?: TemplateBackend;
      }
    ) => Promise<void>;
    outputRoot?: string;
    target?: ScenarioTarget;
  } = {}
) => {
  const checkScenarioFn = params.checkScenarioFn ?? checkScenario;
  const scenarioKeys =
    params.target && params.target !== 'all'
      ? [params.target]
      : resolveScenarioKeysForCheck();

  for (const scenarioKey of scenarioKeys) {
    await checkScenarioFn(scenarioKey, {
      backend: params.backend,
    });
  }
};

export const typecheckScenarios = async (
  params: {
    backend?: TemplateBackend;
    outputRoot?: string;
    runCommand?: typeof run;
    target?: ScenarioTarget;
  } = {}
) => {
  const baseRunCommand = params.runCommand ?? run;

  for (const scenarioKey of resolveScenarioKeys(params.target)) {
    const runCommand = createScenarioRunCommand(scenarioKey, baseRunCommand);
    const { projectDir } = await materializeScenarioSource(scenarioKey, {
      ...params,
      backend: getScenarioBackend(scenarioKey, params.backend),
      runCommand,
    });
    await runPackageScriptIfPresent(projectDir, 'codegen', runCommand);
    await runPackageScriptIfPresent(projectDir, 'typecheck', runCommand);

    const packageJson = readJson<WorkspacePackageJson>(
      path.join(projectDir, 'package.json')
    );
    if (
      packageJson.scripts?.['typecheck:convex'] &&
      !packageJson.scripts.typecheck?.includes('typecheck:convex')
    ) {
      await runCommand(['bun', 'run', 'typecheck:convex'], projectDir);
    }
  }
};

export const codegenScenarios = async (
  params: {
    backend?: TemplateBackend;
    outputRoot?: string;
    runCommand?: typeof run;
    target?: ScenarioTarget;
  } = {}
) => {
  const baseRunCommand = params.runCommand ?? run;

  for (const scenarioKey of resolveScenarioKeys(params.target)) {
    const runCommand = createScenarioRunCommand(scenarioKey, baseRunCommand);
    const { projectDir } = await materializeScenarioSource(scenarioKey, {
      ...params,
      backend: getScenarioBackend(scenarioKey, params.backend),
      runCommand,
    });
    await runPackageScriptIfPresent(projectDir, 'codegen', runCommand);
  }
};

export const runScenarioDev = async (
  scenarioKey: ScenarioKey,
  params: {
    backend?: TemplateBackend;
    outputRoot?: string;
    runCommand?: typeof run;
  } = {}
) => {
  const runCommand = createScenarioRunCommand(
    scenarioKey,
    params.runCommand ?? run
  );
  const backend = getScenarioBackend(scenarioKey, params.backend);
  const { projectDir } = await materializeScenarioSource(scenarioKey, {
    ...params,
    backend,
    runCommand,
  });
  const localBin = path.join(
    projectDir,
    'node_modules',
    '.bin',
    'better-convex'
  );

  if (!existsSync(localBin)) {
    throw new Error(`Missing better-convex binary for ${scenarioKey}.`);
  }

  await runCommand([localBin, 'dev'], projectDir);
};

const main = async () => {
  const { mode, target } = parseScenarioArgs(process.argv.slice(2));

  if (mode === 'materialize') {
    await materializeScenarios({ target });
    return;
  }

  if (mode === 'check') {
    await checkScenarios({ target });
    return;
  }

  if (mode === 'typecheck') {
    await typecheckScenarios({ target });
    return;
  }

  if (mode === 'codegen') {
    await codegenScenarios({ target });
    return;
  }

  if (target === 'all') {
    throw new Error('scenario dev requires a specific scenario target.');
  }

  await runScenarioDev(target);
};

if (import.meta.main) {
  try {
    await main();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
