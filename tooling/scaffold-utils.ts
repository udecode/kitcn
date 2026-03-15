import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BETTER_CONVEX_INSTALL_SPEC_ENV } from '../packages/better-convex/src/cli/supported-dependencies';
import type { TemplateBackend } from './template.config';

export const PROJECT_ROOT = process.cwd();
export const LOCAL_PACKAGE_DIR = path.join(
  PROJECT_ROOT,
  'packages',
  'better-convex'
);
export const LOCAL_CLI_PATH = path.join(
  PROJECT_ROOT,
  'packages',
  'better-convex',
  'src',
  'cli',
  'cli.ts'
);
export const VOLATILE_ENTRY_NAMES = new Set([
  '.better-convex-scenario',
  '.concave',
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
export const VOLATILE_ENTRY_PATTERNS = [/^better-convex-.*\.tgz$/];
const LINE_SPLIT_RE = /\r?\n/;
const BUILT_LOCAL_PACKAGE_DIRS = new Set<string>();
let localBetterConvexInstallSpec: string | undefined;

export type WorkspacePackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  name: string;
  packageManager?: string;
  private?: boolean;
  scripts?: Record<string, string>;
  type?: string;
  version?: string;
};

export const readJson = <T>(filePath: string): T =>
  JSON.parse(readFileSync(filePath, 'utf8')) as T;

export const writeJson = (filePath: string, value: unknown) => {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

export const log = (message: string) => {
  process.stdout.write(`${message}\n`);
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
  const exitCode = await child.exited;

  if (options.allowNonZeroExit) {
    return exitCode;
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }

  return exitCode;
};

const ensureLocalBetterConvexBuild = (packageDir = LOCAL_PACKAGE_DIR) => {
  if (BUILT_LOCAL_PACKAGE_DIRS.has(packageDir)) {
    return;
  }

  const result = Bun.spawnSync({
    cmd: ['bun', 'run', 'build'],
    cwd: packageDir,
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'ignore',
    env: process.env,
  });

  if (result.exitCode !== 0) {
    throw new Error('Failed to build local better-convex package.');
  }

  BUILT_LOCAL_PACKAGE_DIRS.add(packageDir);
};

export const buildLocalCliCommand = (
  args: readonly string[],
  params: {
    backend: TemplateBackend;
    bunBinary?: string;
    localCliPath?: string;
  }
) => [
  params.bunBinary ?? Bun.which('bun') ?? process.execPath,
  params.localCliPath ?? LOCAL_CLI_PATH,
  '--backend',
  params.backend,
  ...args,
];

export const getLocalBetterConvexInstallSpec = () => {
  if (localBetterConvexInstallSpec) {
    return localBetterConvexInstallSpec;
  }

  const outputDir = mkdtempSync(
    path.join(tmpdir(), 'better-convex-local-install-spec-')
  );
  localBetterConvexInstallSpec = packLocalBetterConvexPackage(outputDir);
  return localBetterConvexInstallSpec;
};

export const runLocalCliSteps = async (
  steps: ReadonlyArray<readonly string[]>,
  cwd: string,
  params: {
    backend: TemplateBackend;
    bunBinary?: string;
    localCliPath?: string;
    runCommand?: typeof run;
  }
) => {
  const runCommand = params.runCommand ?? run;

  for (const step of steps) {
    await runCommand(buildLocalCliCommand(step, params), cwd, {
      env: {
        [BETTER_CONVEX_INSTALL_SPEC_ENV]: getLocalBetterConvexInstallSpec(),
      },
    });
  }
};

export const generateFreshApp = async (params: {
  backend: TemplateBackend;
  generatedAppName: string;
  initTemplate: 'next' | 'vite';
  localCliPath?: string;
  projectRoot?: string;
  runCommand?: typeof run;
}) => {
  const tempRoot = mkdtempSync(
    path.join(
      tmpdir(),
      `better-convex-${params.initTemplate}-${params.generatedAppName}-`
    )
  );
  const runCommand = params.runCommand ?? run;

  await runCommand(
    buildLocalCliCommand(
      [
        'create',
        '-t',
        params.initTemplate,
        '--yes',
        '--cwd',
        tempRoot,
        '--name',
        params.generatedAppName,
      ],
      {
        backend: params.backend,
        localCliPath: params.localCliPath,
      }
    ),
    params.projectRoot ?? PROJECT_ROOT,
    {
      env: {
        [BETTER_CONVEX_INSTALL_SPEC_ENV]: getLocalBetterConvexInstallSpec(),
      },
    }
  );

  return {
    generatedAppDir: path.join(tempRoot, params.generatedAppName),
    tempRoot,
  };
};

export const packLocalBetterConvexPackage = (
  outputDir: string,
  packageDir = LOCAL_PACKAGE_DIR
) => {
  ensureLocalBetterConvexBuild(packageDir);

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

export const rewritePackageJsonForLocalBetterConvex = (
  packageJsonPath: string,
  betterConvexPackageSpec: string,
  params: {
    packageName?: string;
  } = {}
) => {
  const packageJson = readJson<WorkspacePackageJson>(packageJsonPath);

  writeJson(packageJsonPath, {
    ...packageJson,
    dependencies: {
      ...packageJson.dependencies,
      'better-convex': betterConvexPackageSpec,
    },
    name: params.packageName ?? packageJson.name,
  });
};

export const installLocalBetterConvex = async (
  directory: string,
  params: {
    betterConvexPackageSpec?: string;
    outputDir?: string;
    packageName?: string;
    runCommand?: typeof run;
  } = {}
) => {
  const packageJsonPath = path.join(directory, 'package.json');
  const betterConvexPackageSpec =
    params.betterConvexPackageSpec ??
    packLocalBetterConvexPackage(params.outputDir ?? directory);

  rewritePackageJsonForLocalBetterConvex(
    packageJsonPath,
    betterConvexPackageSpec,
    {
      packageName: params.packageName,
    }
  );

  await (params.runCommand ?? run)(
    ['bun', 'install', '--linker', 'hoisted'],
    directory
  );

  return betterConvexPackageSpec;
};

export const stripVolatileArtifacts = (directory: string) => {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    return;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (
      VOLATILE_ENTRY_NAMES.has(entry.name) ||
      VOLATILE_ENTRY_PATTERNS.some((pattern) => pattern.test(entry.name))
    ) {
      rmSync(entryPath, { recursive: true, force: true });
      continue;
    }

    if (entry.isDirectory()) {
      stripVolatileArtifacts(entryPath);
    }
  }
};

export const normalizeEnvLocal = (directory: string) => {
  const envLocalPath = path.join(directory, '.env.local');
  if (!existsSync(envLocalPath)) {
    return;
  }

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
};

export const readPackageScripts = (directory: string) =>
  readJson<WorkspacePackageJson>(path.join(directory, 'package.json'))
    .scripts ?? {};

export const runPackageScriptIfPresent = async (
  directory: string,
  scriptName: string,
  runCommand: typeof run = run
) => {
  const scripts = readPackageScripts(directory);
  if (!scripts[scriptName]) {
    return false;
  }

  await runCommand(['bun', 'run', scriptName], directory);
  return true;
};

export const runAppValidation = async (
  directory: string,
  runCommand: typeof run = run,
  options: {
    lint?: boolean;
  } = {}
) => {
  const scripts = readPackageScripts(directory);

  if (scripts.codegen) {
    await runCommand(['bun', 'run', 'codegen'], directory);
  }

  if (options.lint !== false && scripts.lint) {
    await runCommand(['bun', 'run', 'lint'], directory);
  }

  if (scripts.typecheck) {
    await runCommand(['bun', 'run', 'typecheck'], directory);
  }

  if (
    scripts['typecheck:convex'] &&
    !scripts.typecheck?.includes('typecheck:convex')
  ) {
    await runCommand(['bun', 'run', 'typecheck:convex'], directory);
  }
};
