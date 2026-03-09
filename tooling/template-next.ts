import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const FIXTURE_DIR = path.join(PROJECT_ROOT, 'templates', 'next');
const LOCAL_PACKAGE_DIR = path.join(PROJECT_ROOT, 'packages', 'better-convex');
const LOCAL_CLI_PATH = path.join(
  PROJECT_ROOT,
  'packages',
  'better-convex',
  'src',
  'cli',
  'cli.ts'
);
const GENERATED_APP_NAME = 'next';
const FIXTURE_PACKAGE_NAME = 'better-convex-template-next';
const VALIDATION_PACKAGE_NAME = 'better-convex-template-next-check';
const LINE_SPLIT_RE = /\r?\n/;
const VOLATILE_ENTRY_NAMES = new Set([
  '.env',
  '.git',
  '.convex',
  '.next',
  '.turbo',
  'bun.lock',
  'next-env.d.ts',
  'node_modules',
  'package-lock.json',
  'pnpm-lock.yaml',
  'tsconfig.tsbuildinfo',
  'yarn.lock',
]);

type WorkspacePackageJson = {
  name: string;
  version?: string;
  type?: string;
  private?: boolean;
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const readJson = <T>(filePath: string): T =>
  JSON.parse(readFileSync(filePath, 'utf8')) as T;

const writeJson = (filePath: string, value: unknown) => {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const log = (message: string) => {
  process.stdout.write(`${message}\n`);
};

export const stripVolatileArtifacts = (directory: string) => {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    return;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (VOLATILE_ENTRY_NAMES.has(entry.name)) {
      rmSync(entryPath, { recursive: true, force: true });
      continue;
    }

    if (entry.isDirectory()) {
      stripVolatileArtifacts(entryPath);
    }
  }
};

const normalizePackageJson = (packageJsonPath: string) => {
  const packageJson = readJson<WorkspacePackageJson>(packageJsonPath);
  const normalizedPackageJson: WorkspacePackageJson = {
    name: FIXTURE_PACKAGE_NAME,
    version: packageJson.version,
    type: packageJson.type,
    private: packageJson.private ?? true,
    packageManager: packageJson.packageManager,
    scripts: packageJson.scripts,
    dependencies: {
      ...packageJson.dependencies,
      'better-convex': 'workspace:*',
    },
    devDependencies: packageJson.devDependencies,
  };

  writeJson(packageJsonPath, normalizedPackageJson);
};

const preparePackageJsonForValidation = (
  packageJsonPath: string,
  betterConvexPackageSpec: string
) => {
  const packageJson = readJson<WorkspacePackageJson>(packageJsonPath);
  const validationPackageJson: WorkspacePackageJson = {
    ...packageJson,
    name: VALIDATION_PACKAGE_NAME,
    dependencies: {
      ...packageJson.dependencies,
      'better-convex': betterConvexPackageSpec,
    },
  };

  writeJson(packageJsonPath, validationPackageJson);
};

export const packLocalBetterConvexPackage = (
  outputDir: string,
  packageDir = LOCAL_PACKAGE_DIR
) => {
  const result = Bun.spawnSync({
    cmd: ['npm', 'pack', packageDir, '--pack-destination', outputDir, '--json'],
    cwd: PROJECT_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.toString().trim() || 'Failed to pack better-convex.'
    );
  }

  const packed = JSON.parse(result.stdout.toString()) as Array<{
    filename: string;
  }>;
  const filename = packed[0]?.filename;
  if (!filename) {
    throw new Error('Failed to resolve packed better-convex tarball.');
  }
  return `file:${path.join(outputDir, filename)}`;
};

export const normalizeTemplate = (directory: string) => {
  stripVolatileArtifacts(directory);
  normalizePackageJson(path.join(directory, 'package.json'));
  const envLocalPath = path.join(directory, '.env.local');
  if (existsSync(envLocalPath)) {
    const normalizedEnvLocal = readFileSync(envLocalPath, 'utf8')
      .split(LINE_SPLIT_RE)
      .filter(
        (line) =>
          !line.startsWith('CONVEX_DEPLOYMENT=') &&
          line !== '# Deployment used by `npx convex dev`'
      )
      .join('\n')
      .trimEnd();
    writeFileSync(envLocalPath, `${normalizedEnvLocal}\n`);
  }
};

export const run = async (
  cmd: string[],
  cwd: string,
  options: {
    allowNonZeroExit?: boolean;
    env?: Record<string, string | undefined>;
  } = {}
): Promise<number> => {
  const child = Bun.spawn({
    cmd,
    cwd,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  const actualExitCode = await child.exited;

  if (options.allowNonZeroExit) {
    return actualExitCode;
  }

  if (actualExitCode !== 0) {
    process.exit(actualExitCode);
  }

  return actualExitCode;
};

export const generateTemplate = async (
  params: {
    projectRoot?: string;
    localCliPath?: string;
    generatedAppName?: string;
    runCommand?: typeof run;
  } = {}
) => {
  const projectRoot = params.projectRoot ?? PROJECT_ROOT;
  const localCliPath = params.localCliPath ?? LOCAL_CLI_PATH;
  const generatedAppName = params.generatedAppName ?? GENERATED_APP_NAME;
  const runCommand = params.runCommand ?? run;
  const tempRoot = mkdtempSync(
    path.join(tmpdir(), 'better-convex-template-next-')
  );
  const bunBinary = Bun.which('bun') ?? process.execPath;

  await runCommand(
    [
      bunBinary,
      localCliPath,
      '--backend',
      'concave',
      'init',
      '-t',
      'next',
      '--yes',
      '--cwd',
      tempRoot,
      '--name',
      generatedAppName,
    ],
    projectRoot
  );

  const generatedAppDir = path.join(tempRoot, generatedAppName);

  return { tempRoot, generatedAppDir };
};

export const validateGeneratedTemplateApp = async (
  generatedAppDir: string,
  runCommand: typeof run = run,
  params: {
    betterConvexPackageSpec?: string;
  } = {}
) => {
  preparePackageJsonForValidation(
    path.join(generatedAppDir, 'package.json'),
    params.betterConvexPackageSpec ??
      packLocalBetterConvexPackage(generatedAppDir)
  );
  await runCommand(['bun', 'install'], generatedAppDir);
  await runCommand(['bun', 'run', 'lint'], generatedAppDir);
  await runCommand(['bun', 'run', 'typecheck'], generatedAppDir);
  await runCommand(['bun', 'run', 'build'], generatedAppDir);
};

export const syncTemplate = async (
  params: {
    fixtureDir?: string;
    generateTemplateFn?: typeof generateTemplate;
    normalizeTemplateFn?: typeof normalizeTemplate;
    logFn?: typeof log;
  } = {}
) => {
  const fixtureDir = params.fixtureDir ?? FIXTURE_DIR;
  const generateTemplateFn = params.generateTemplateFn ?? generateTemplate;
  const normalizeTemplateFn = params.normalizeTemplateFn ?? normalizeTemplate;
  const logFn = params.logFn ?? log;
  const { tempRoot, generatedAppDir } = await generateTemplateFn();

  try {
    normalizeTemplateFn(generatedAppDir);
    mkdirSync(path.dirname(fixtureDir), { recursive: true });
    rmSync(fixtureDir, { recursive: true, force: true });
    cpSync(generatedAppDir, fixtureDir, { recursive: true });
    logFn(`Synced ${path.relative(PROJECT_ROOT, fixtureDir)}.`);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
};

export const checkTemplate = async (
  params: {
    fixtureDir?: string;
    projectRoot?: string;
    generateTemplateFn?: typeof generateTemplate;
    normalizeTemplateFn?: typeof normalizeTemplate;
    validateGeneratedTemplateAppFn?: typeof validateGeneratedTemplateApp;
    runCommand?: typeof run;
    logFn?: typeof log;
  } = {}
) => {
  const fixtureDir = params.fixtureDir ?? FIXTURE_DIR;
  const projectRoot = params.projectRoot ?? PROJECT_ROOT;
  const generateTemplateFn = params.generateTemplateFn ?? generateTemplate;
  const normalizeTemplateFn = params.normalizeTemplateFn ?? normalizeTemplate;
  const validateGeneratedTemplateAppFn =
    params.validateGeneratedTemplateAppFn ?? validateGeneratedTemplateApp;
  const runCommand = params.runCommand ?? run;
  const logFn = params.logFn ?? log;
  if (!existsSync(fixtureDir)) {
    throw new Error(
      'templates/next is missing. Run `bun run template:next:sync` first.'
    );
  }

  const { tempRoot, generatedAppDir } = await generateTemplateFn();

  try {
    const betterConvexPackageSpec = packLocalBetterConvexPackage(tempRoot);
    await validateGeneratedTemplateAppFn(generatedAppDir, runCommand, {
      betterConvexPackageSpec,
    });
    normalizeTemplateFn(generatedAppDir);
    const fixtureDiffDir = path.join(tempRoot, '__fixture__');

    cpSync(fixtureDir, fixtureDiffDir, { recursive: true });
    stripVolatileArtifacts(fixtureDiffDir);

    const diffExitCode = await runCommand(
      [
        'git',
        'diff',
        '--no-index',
        '--no-ext-diff',
        '--',
        fixtureDiffDir,
        generatedAppDir,
      ],
      projectRoot,
      {
        allowNonZeroExit: true,
      }
    );

    if (diffExitCode === 0) {
      logFn(
        'templates/next matches fresh `better-convex init -t next` output.'
      );
      return;
    }

    if (diffExitCode === 1) {
      logFn('');
      logFn(
        'Template drift detected. Run `bun run template:next:sync` and commit the updated fixture.'
      );
      process.exit(1);
    }

    process.exit(diffExitCode);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
};

const main = async () => {
  const mode = process.argv[2];

  if (mode === 'sync') {
    await syncTemplate();
    return;
  }

  if (mode === 'check') {
    await checkTemplate();
    return;
  }

  throw new Error('Usage: bun tooling/template-next.ts <sync|check>');
};

if (import.meta.main) {
  await main();
}
