import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { parseEnv } from 'node:util';
import {
  KITCN_INSTALL_SPEC_ENV,
  KITCN_RESEND_INSTALL_SPEC_ENV,
} from '../packages/kitcn/src/cli/supported-dependencies';
import { runAuthSchemaStress } from './auth-schema-stress';
import { runAuthSmoke } from './auth-smoke';
import {
  buildLocalCliCommand,
  DEFAULT_LOCAL_DEV_PORT,
  generateFreshApp,
  getLocalInstallSpec,
  getLocalResendInstallSpec,
  installLocalPackage,
  LOCAL_CLI_PATH,
  log,
  normalizeEnvLocal,
  PROJECT_ROOT,
  packLocalPackage,
  patchPreparedLocalDevPort,
  readJson,
  readPackageScripts,
  run,
  runAppValidation,
  runPackageScriptIfPresent,
  stripVolatileArtifacts,
  type WorkspacePackageJson,
} from './scaffold-utils';
import {
  DEFAULT_CHECK_SCENARIO_KEYS,
  SCENARIO_DEFINITIONS,
  SCENARIO_KEYS,
  type ScenarioKey,
} from './scenario.config';
import type { TemplateBackend } from './template.config';

export type ScenarioMode = 'prepare' | 'check' | 'codegen' | 'dev' | 'test';

export type ScenarioTarget = 'all' | ScenarioKey;
export type ScenarioProofPath =
  | 'runtime'
  | 'auth-demo'
  | 'auth-runtime'
  | 'check';

type ScenarioSpawnedProcess = {
  exited: Promise<number>;
  kill: (signal?: string) => void;
  killed?: boolean;
};

type RunningScenarioProcess = ScenarioSpawnedProcess & {
  exitCode?: number;
};

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
const DEV_SCRIPT_OWNS_BACKEND_RE =
  /\bconvex:dev\b|\bdev:backend\b|\bkitcn dev\b|\bconvex dev\b/;
const KITCN_DEV_RE = /\bkitcn dev\b/;
const VITE_DEV_RE = /\bvite(?:\s|$)/;
const VITE_CONFIG_FILES = [
  'vite.config.ts',
  'vite.config.mts',
  'vite.config.js',
  'vite.config.mjs',
] as const;
const DEFAULT_SCENARIO_READY_URL = 'http://127.0.0.1:3210/_dashboard';
const READY_POLL_INTERVAL_MS = 250;
const READY_TIMEOUT_MS = 30_000;
const SCENARIO_STOP_SIGNAL = 'SIGINT';
const TRAILING_SLASH_RE = /\/+$/;
const BOOTSTRAP_CHECK_SCENARIOS = new Set<ScenarioKey>([
  'convex-next-auth-bootstrap',
  'convex-vite-auth-bootstrap',
  'convex-next-all',
  'create-convex-nextjs-shadcn-auth',
]);

const isPortAvailable = (port: number) =>
  new Promise<boolean>((resolve) => {
    const server = createServer();
    server.unref();
    server.once('error', () => {
      resolve(false);
    });
    server.listen(port, () => {
      server.close(() => {
        resolve(true);
      });
    });
  });

export const findAvailableScenarioDevPort = async ({
  isPortAvailableFn = isPortAvailable,
  maxAttempts = 25,
  preferredPort = DEFAULT_LOCAL_DEV_PORT,
}: {
  isPortAvailableFn?: (port: number) => Promise<boolean>;
  maxAttempts?: number;
  preferredPort?: number;
} = {}) => {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const port = preferredPort + offset;
    if (await isPortAvailableFn(port)) {
      return port;
    }
  }

  throw new Error(
    `Could not find an open local scenario dev port after ${maxAttempts} attempts starting at ${preferredPort}.`
  );
};

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
) => path.join(getScenarioDir(scenarioKey, outputRoot), '.kitcn-scenario');

const getTemplateFixtureDir = (templateKey: string) =>
  path.join(PROJECT_ROOT, 'fixtures', templateKey);

const getScenarioPluginsLockPath = (projectDir: string) =>
  path.join(projectDir, 'convex', 'functions', 'plugins.lock.json');

const getScenarioLocalConvexEnvPath = (projectDir: string) =>
  path.join(projectDir, 'convex', '.env');

const getPreparedScenarioProjectDir = (
  scenarioKey: ScenarioKey,
  outputRoot = DEFAULT_OUTPUT_ROOT
) => {
  const projectDir = getScenarioProjectDir(scenarioKey, outputRoot);
  const packageJsonPath = path.join(projectDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    throw new Error(
      `Scenario "${scenarioKey}" is not prepared. Run \`bun run scenario:prepare -- ${scenarioKey}\` or \`bun run scenario:check -- ${scenarioKey}\` first.`
    );
  }

  return projectDir;
};

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const trimTrailingSlash = (value: string) =>
  value.replace(TRAILING_SLASH_RE, '');

const readScenarioSiteUrl = (projectDir: string) => {
  const envLocalPath = path.join(projectDir, '.env.local');
  if (!existsSync(envLocalPath)) {
    return undefined;
  }

  const parsed = parseEnv(readFileSync(envLocalPath, 'utf8'));
  return parsed.NEXT_PUBLIC_SITE_URL ?? parsed.VITE_SITE_URL;
};

const resolveScenarioReadyUrl = (projectDir: string) =>
  trimTrailingSlash(
    readScenarioSiteUrl(projectDir) ?? DEFAULT_SCENARIO_READY_URL
  );

export const resolvePrepareBootstrapSteps = (
  scenarioKey: ScenarioKey,
  projectDir: string
) => {
  const scenario = SCENARIO_DEFINITIONS[scenarioKey];
  if (scenario.source.kind !== 'template') {
    return [] as Array<readonly string[]>;
  }

  const pluginsLockPath = getScenarioPluginsLockPath(projectDir);
  if (!existsSync(pluginsLockPath)) {
    return [] as Array<readonly string[]>;
  }

  const pluginsLock = readJson<{
    plugins?: Record<string, unknown>;
  }>(pluginsLockPath);
  if (!pluginsLock.plugins?.auth) {
    return [] as Array<readonly string[]>;
  }

  if (existsSync(getScenarioLocalConvexEnvPath(projectDir))) {
    return [] as Array<readonly string[]>;
  }

  return [['add', 'auth', '--overwrite', '--yes', '--no-codegen']] as const;
};

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

const resolveScenarioProcessEnv = (scenarioKey: ScenarioKey) => {
  const scenarioEnv = SCENARIO_DEFINITIONS[scenarioKey].env;
  if (!scenarioEnv) {
    return {
      ...process.env,
      ...CLEARED_CONVEX_ENV,
    };
  }

  const scenarioHome =
    scenarioEnv.CONVEX_AGENT_MODE === 'anonymous'
      ? path.join(PROJECT_ROOT, 'tmp', 'scenario-homes', scenarioKey)
      : undefined;

  return {
    ...process.env,
    ...CLEARED_CONVEX_ENV,
    ...(scenarioHome
      ? {
          HOME: scenarioHome,
        }
      : {}),
    ...scenarioEnv,
  };
};

const spawnScenarioCommand = (
  scenarioKey: ScenarioKey,
  cmd: string[],
  cwd: string
): ScenarioSpawnedProcess =>
  Bun.spawn({
    cmd,
    cwd,
    env: resolveScenarioProcessEnv(scenarioKey),
    stdio: ['ignore', 'inherit', 'inherit'],
  });

const devScriptOwnsBackend = (scripts: Record<string, string>) =>
  DEV_SCRIPT_OWNS_BACKEND_RE.test(scripts.dev ?? '');

const isCreateConvexFixtureScenario = (scenarioKey: ScenarioKey) => {
  const source = SCENARIO_DEFINITIONS[scenarioKey].source;
  return (
    source.kind === 'fixture' && source.fixture.startsWith('create-convex')
  );
};

const convexDevOwnsFrontend = (
  backend: TemplateBackend,
  scripts: Record<string, string>
) =>
  backend === 'concave' &&
  KITCN_DEV_RE.test(scripts['convex:dev'] ?? '') &&
  VITE_DEV_RE.test(scripts.dev ?? '');

const isViteScenarioProject = (projectDir: string) =>
  VITE_CONFIG_FILES.some((fileName) =>
    existsSync(path.join(projectDir, fileName))
  );

const buildBackendOnlyDevCommand = (
  backend: TemplateBackend,
  scripts: Record<string, string>
) => {
  if (scripts['convex:dev']) {
    return ['bun', 'run', 'convex:dev', '--', '--frontend', 'no'];
  }

  return buildLocalCliCommand(['dev', '--frontend', 'no'], {
    backend,
    localCliPath: LOCAL_CLI_PATH,
  });
};

const resolveScenarioDevCommands = (
  scenarioKey: ScenarioKey,
  params: {
    backend?: TemplateBackend;
    outputRoot?: string;
  } = {}
) => {
  const backend = getScenarioBackend(scenarioKey, params.backend);
  const projectDir = getPreparedScenarioProjectDir(
    scenarioKey,
    params.outputRoot
  );
  const scripts = readPackageScripts(projectDir);
  const isViteProject = isViteScenarioProject(projectDir);

  if (isCreateConvexFixtureScenario(scenarioKey)) {
    if (scripts['convex:dev'] && scripts['dev:frontend']) {
      if (backend === 'concave' && isViteProject) {
        return {
          commands: [
            buildBackendOnlyDevCommand(backend, scripts),
            ['bun', 'run', 'dev:frontend'],
          ],
          projectDir,
        };
      }

      if (
        convexDevOwnsFrontend(backend, {
          ...scripts,
          dev: scripts['dev:frontend'],
        })
      ) {
        return {
          commands: [['bun', 'run', 'convex:dev']],
          projectDir,
        };
      }

      return {
        commands: [
          ['bun', 'run', 'convex:dev'],
          ['bun', 'run', 'dev:frontend'],
        ],
        projectDir,
      };
    }

    if (scripts['convex:dev']) {
      return {
        commands: [['bun', 'run', 'convex:dev']],
        projectDir,
      };
    }

    return {
      commands: [
        buildLocalCliCommand(['dev'], {
          backend,
          localCliPath: LOCAL_CLI_PATH,
        }),
      ],
      projectDir,
    };
  }

  if (
    backend === 'concave' &&
    isViteProject &&
    scripts.dev &&
    VITE_DEV_RE.test(scripts.dev ?? '')
  ) {
    return {
      commands: [
        buildBackendOnlyDevCommand(backend, scripts),
        ['bun', 'run', 'dev'],
      ],
      projectDir,
    };
  }

  if (convexDevOwnsFrontend(backend, scripts) && scripts['convex:dev']) {
    return {
      commands: [['bun', 'run', 'convex:dev']],
      projectDir,
    };
  }

  if (scripts.dev && scripts['convex:dev'] && !devScriptOwnsBackend(scripts)) {
    return {
      commands: [
        ['bun', 'run', 'convex:dev'],
        ['bun', 'run', 'dev'],
      ],
      projectDir,
    };
  }

  if (scripts.dev) {
    return {
      commands: [['bun', 'run', 'dev']],
      projectDir,
    };
  }

  if (scripts['convex:dev']) {
    return {
      commands: [['bun', 'run', 'convex:dev']],
      projectDir,
    };
  }

  throw new Error(
    `Scenario "${scenarioKey}" has no runnable dev script. Expected \`dev\` or \`convex:dev\`, found: ${Object.keys(scripts).join(', ') || 'none'}.`
  );
};

const startScenarioProcesses = (
  scenarioKey: ScenarioKey,
  projectDir: string,
  commands: string[][],
  spawnCommand: (
    scenarioKey: ScenarioKey,
    cmd: string[],
    cwd: string
  ) => ScenarioSpawnedProcess
) =>
  commands.map((cmd) => {
    const process = spawnCommand(scenarioKey, cmd, projectDir);
    const runningProcess: RunningScenarioProcess = {
      exited: process.exited,
      kill: (signal?: string) => {
        process.kill(signal);
      },
      killed: process.killed,
      exitCode: undefined,
    };
    process.exited.then((exitCode) => {
      runningProcess.exitCode = exitCode;
    });
    return runningProcess;
  });

const stopRunningScenarioProcesses = async (
  processes: readonly RunningScenarioProcess[]
) => {
  for (const process of processes) {
    if (!process.killed && process.exitCode === undefined) {
      process.kill(SCENARIO_STOP_SIGNAL);
    }
  }

  await Promise.allSettled(processes.map((process) => process.exited));
};

const waitForScenarioReady = async (
  scenarioKey: ScenarioKey,
  projectDir: string,
  processes: readonly RunningScenarioProcess[],
  fetchFn: typeof fetch = fetch,
  timeoutMs = READY_TIMEOUT_MS
) => {
  const readyUrl = resolveScenarioReadyUrl(projectDir);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const process of processes) {
      if (process.exitCode !== undefined) {
        throw new Error(
          `Scenario "${scenarioKey}" dev exited with code ${process.exitCode}.`
        );
      }
    }

    try {
      const response = await fetchFn(readyUrl, {
        method: 'GET',
        redirect: 'manual',
      });
      if (response.ok) {
        return;
      }
    } catch {}

    await sleep(READY_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Scenario "${scenarioKey}" did not become ready at ${readyUrl} within ${timeoutMs}ms.`
  );
};

export const resolveScenarioProofPath = (
  scenarioKey: ScenarioKey
): ScenarioProofPath => {
  if (BOOTSTRAP_CHECK_SCENARIOS.has(scenarioKey)) {
    return 'check';
  }
  if (scenarioKey === 'next-auth' || scenarioKey === 'start-auth') {
    return 'auth-demo';
  }
  if (scenarioKey === 'vite-auth') {
    return 'auth-runtime';
  }
  return 'runtime';
};

const runSpawnedScenarioProcesses = async (
  scenarioKey: ScenarioKey,
  projectDir: string,
  commands: string[][],
  spawnCommand: (
    scenarioKey: ScenarioKey,
    cmd: string[],
    cwd: string
  ) => ScenarioSpawnedProcess
) => {
  const processes = commands.map((cmd) =>
    spawnCommand(scenarioKey, cmd, projectDir)
  );
  const firstExit = await Promise.race(
    processes.map((process, index) =>
      process.exited.then((exitCode) => ({ exitCode, index }))
    )
  );

  for (const [index, process] of processes.entries()) {
    if (index !== firstExit.index && !process.killed) {
      process.kill(SCENARIO_STOP_SIGNAL);
    }
  }

  await Promise.allSettled(processes.map((process) => process.exited));

  if (firstExit.exitCode !== 0 && firstExit.exitCode !== 130) {
    throw new Error(
      `Scenario "${scenarioKey}" dev exited with code ${firstExit.exitCode}.`
    );
  }
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

  if (command === 'kitcn') {
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

  return buildLocalCliCommand(step, {
    backend: params.backend,
    localCliPath: LOCAL_CLI_PATH,
  });
};

export const resolveScenarioStepEnv = (
  step: readonly string[],
  params: {
    kitcnInstallSpec: string;
    resendInstallSpec: string;
  }
) => {
  const [command] = step;
  if (command === 'convex') {
    return undefined;
  }

  return {
    [KITCN_INSTALL_SPEC_ENV]: params.kitcnInstallSpec,
    [KITCN_RESEND_INSTALL_SPEC_ENV]: params.resendInstallSpec,
  };
};

export const resolveScenarioInstallSpecs = (projectDir: string) => {
  const packageJson = readJson<WorkspacePackageJson>(
    path.join(projectDir, 'package.json')
  );
  const dependencies = {
    ...packageJson.devDependencies,
    ...packageJson.dependencies,
  };

  return {
    kitcnInstallSpec: dependencies.kitcn ?? getLocalInstallSpec(),
    resendInstallSpec:
      dependencies['@kitcn/resend'] ?? getLocalResendInstallSpec(),
  };
};

const runScenarioCommands = async (
  steps: ReadonlyArray<readonly string[]>,
  params: {
    backend: TemplateBackend;
    projectDir: string;
    runCommand: typeof run;
  }
) => {
  const localCliEnv = resolveScenarioInstallSpecs(params.projectDir);

  for (const step of steps) {
    const env = resolveScenarioStepEnv(step, localCliEnv);
    await params.runCommand(
      resolveScenarioCommand(step, {
        backend: params.backend,
        projectDir: params.projectDir,
      }),
      params.projectDir,
      env ? { env } : undefined
    );
  }
};

export const resolveScenarioKeysForCheck = () => [
  ...DEFAULT_CHECK_SCENARIO_KEYS,
];

export const parseScenarioArgs = (
  argv: string[]
): {
  mode: ScenarioMode;
  target: ScenarioTarget;
} => {
  const [mode, targetArg] = argv;
  if (
    mode !== 'prepare' &&
    mode !== 'check' &&
    mode !== 'test' &&
    mode !== 'codegen' &&
    mode !== 'dev'
  ) {
    throw new Error(
      `Usage: bun tooling/scenarios.ts <prepare|check|test|codegen|dev> [all|${SCENARIO_KEYS.join('|')}]`
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
    kitcnPackageSpec: string;
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
        kitcnPackageSpec: params.kitcnPackageSpec,
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

const prepareScenarioSource = async (
  scenarioKey: ScenarioKey,
  params: {
    backend?: TemplateBackend;
    findAvailableScenarioDevPortFn?: typeof findAvailableScenarioDevPort;
    installLocalPackageFn?: typeof installLocalPackage;
    outputRoot?: string;
    patchPreparedLocalDevPortFn?: typeof patchPreparedLocalDevPort;
    packLocalPackageFn?: typeof packLocalPackage;
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
  const packLocalPackageFn = params.packLocalPackageFn ?? packLocalPackage;
  const installLocalPackageFn =
    params.installLocalPackageFn ?? installLocalPackage;
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

  const bootstrapSteps = resolvePrepareBootstrapSteps(scenarioKey, projectDir);
  const kitcnPackageSpec = packLocalPackageFn(metadataDir);
  let installedLocalPackage = false;

  if (bootstrapSteps.length > 0) {
    await installLocalPackageFn(projectDir, {
      kitcnPackageSpec,
      runCommand,
    });
    installedLocalPackage = true;
  }

  await runScenarioCommands(bootstrapSteps, {
    backend,
    projectDir,
    runCommand,
  });

  await runScenarioCommands(scenario.setup, {
    backend,
    projectDir,
    runCommand,
  });

  const localDevPort = await (
    params.findAvailableScenarioDevPortFn ?? findAvailableScenarioDevPort
  )();
  (params.patchPreparedLocalDevPortFn ?? patchPreparedLocalDevPort)(
    projectDir,
    localDevPort
  );

  if (!installedLocalPackage) {
    await installLocalPackageFn(projectDir, {
      kitcnPackageSpec,
      runCommand,
    });
  }
  writeScenarioMetadata(scenarioKey, outputRoot, {
    kitcnPackageSpec,
    backend,
    source: scenario.source,
    steps: scenario.setup,
  });

  return { metadataDir, projectDir, scenarioDir };
};

export const prepareScenario = async (
  scenarioKey: ScenarioKey,
  params: {
    backend?: TemplateBackend;
    findAvailableScenarioDevPortFn?: typeof findAvailableScenarioDevPort;
    installLocalPackageFn?: typeof installLocalPackage;
    logFn?: typeof log;
    outputRoot?: string;
    patchPreparedLocalDevPortFn?: typeof patchPreparedLocalDevPort;
    packLocalPackageFn?: typeof packLocalPackage;
    runCommand?: typeof run;
  } = {}
) => {
  const runCommand = createScenarioRunCommand(
    scenarioKey,
    params.runCommand ?? run
  );
  const { projectDir } = await prepareScenarioSource(scenarioKey, {
    ...params,
    runCommand,
  });
  (params.logFn ?? log)(
    `Prepared ${scenarioKey} -> ${path.relative(PROJECT_ROOT, projectDir)}`
  );
  return projectDir;
};

export const prepareScenarios = async (
  params: {
    backend?: TemplateBackend;
    prepareScenarioFn?: typeof prepareScenario;
    outputRoot?: string;
    target?: ScenarioTarget;
  } = {}
) => {
  const prepareScenarioFn = params.prepareScenarioFn ?? prepareScenario;

  for (const scenarioKey of resolveScenarioKeys(params.target)) {
    await prepareScenarioFn(scenarioKey, {
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
    prepareScenarioSourceFn?: typeof prepareScenarioSource;
    runCommand?: typeof run;
    runAuthSchemaStressFn?: typeof runAuthSchemaStress;
    validateAppFn?: typeof runAppValidation;
  } = {}
) => {
  const runCommand = createScenarioRunCommand(
    scenarioKey,
    params.runCommand ?? run
  );
  const backend = getScenarioBackend(scenarioKey, params.backend);
  stopScenarioBackends(params.outputRoot);
  const { projectDir } = await (
    params.prepareScenarioSourceFn ?? prepareScenarioSource
  )(scenarioKey, {
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
    if (SCENARIO_DEFINITIONS[scenarioKey].validation.authSchemaStress) {
      await (params.runAuthSchemaStressFn ?? runAuthSchemaStress)({
        projectDir,
        runCommand,
      });
    }
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
    const { projectDir } = await prepareScenarioSource(scenarioKey, {
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
    spawnCommand?: (
      scenarioKey: ScenarioKey,
      cmd: string[],
      cwd: string
    ) => ScenarioSpawnedProcess;
  } = {}
) => {
  const runCommand = createScenarioRunCommand(
    scenarioKey,
    params.runCommand ?? run
  );
  const spawnCommand = params.spawnCommand ?? spawnScenarioCommand;
  const { commands, projectDir } = resolveScenarioDevCommands(scenarioKey, {
    backend: params.backend,
    outputRoot: params.outputRoot,
  });

  if (commands.length === 1) {
    await runCommand(commands[0]!, projectDir);
    return;
  }

  await runSpawnedScenarioProcesses(
    scenarioKey,
    projectDir,
    commands,
    spawnCommand
  );
};

export const runScenarioRuntimeProof = async (
  scenarioKey: ScenarioKey,
  params: {
    backend?: TemplateBackend;
    outputRoot?: string;
    spawnCommand?: (
      scenarioKey: ScenarioKey,
      cmd: string[],
      cwd: string
    ) => ScenarioSpawnedProcess;
    waitForReadyFn?: (
      scenarioKey: ScenarioKey,
      projectDir: string,
      processes: readonly RunningScenarioProcess[]
    ) => Promise<void>;
    afterReadyFn?: (scenarioKey: ScenarioKey) => Promise<void>;
  } = {}
) => {
  const spawnCommand = params.spawnCommand ?? spawnScenarioCommand;
  const waitForReadyFn = params.waitForReadyFn ?? waitForScenarioReady;
  const { commands, projectDir } = resolveScenarioDevCommands(scenarioKey, {
    backend: params.backend,
    outputRoot: params.outputRoot,
  });
  const processes = startScenarioProcesses(
    scenarioKey,
    projectDir,
    commands,
    spawnCommand
  );

  try {
    await waitForReadyFn(scenarioKey, projectDir, processes);
    await params.afterReadyFn?.(scenarioKey);
  } finally {
    await stopRunningScenarioProcesses(processes);
  }
};

export const runScenarioTest = async (
  scenarioKey: ScenarioKey,
  params: {
    backend?: TemplateBackend;
    outputRoot?: string;
    prepareScenarioFn?: typeof prepareScenario;
    checkScenarioFn?: typeof checkScenario;
    runScenarioRuntimeProofFn?: typeof runScenarioRuntimeProof;
    runAuthSmokeFn?: typeof runAuthSmoke;
  } = {}
) => {
  const proofPath = resolveScenarioProofPath(scenarioKey);

  if (proofPath === 'check') {
    await (params.checkScenarioFn ?? checkScenario)(scenarioKey, {
      backend: params.backend,
      outputRoot: params.outputRoot,
    });
    return;
  }

  await (params.prepareScenarioFn ?? prepareScenario)(scenarioKey, {
    backend: params.backend,
    outputRoot: params.outputRoot,
  });
  await (params.runScenarioRuntimeProofFn ?? runScenarioRuntimeProof)(
    scenarioKey,
    {
      backend: params.backend,
      outputRoot: params.outputRoot,
      afterReadyFn:
        proofPath === 'auth-demo'
          ? async (readyScenarioKey) => {
              await (params.runAuthSmokeFn ?? runAuthSmoke)([readyScenarioKey]);
            }
          : undefined,
    }
  );
};

export const testScenarios = async (
  params: {
    backend?: TemplateBackend;
    outputRoot?: string;
    target?: ScenarioTarget;
    runScenarioTestFn?: typeof runScenarioTest;
  } = {}
) => {
  const runScenarioTestFn = params.runScenarioTestFn ?? runScenarioTest;

  for (const scenarioKey of resolveScenarioKeys(params.target)) {
    await runScenarioTestFn(scenarioKey, {
      backend: params.backend,
      outputRoot: params.outputRoot,
    });
  }
};

const main = async () => {
  const { mode, target } = parseScenarioArgs(process.argv.slice(2));

  if (mode === 'prepare') {
    await prepareScenarios({ target });
    return;
  }

  if (mode === 'check') {
    await checkScenarios({ target });
    return;
  }

  if (mode === 'codegen') {
    await codegenScenarios({ target });
    return;
  }

  if (mode === 'test') {
    await testScenarios({ target });
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
