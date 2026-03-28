import {
  cpSync,
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
import {
  BETTER_CONVEX_INSTALL_SPEC_ENV,
  BETTER_CONVEX_RESEND_INSTALL_SPEC_ENV,
} from '../packages/better-convex/src/cli/supported-dependencies';
import type { TemplateBackend } from './template.config';

export const PROJECT_ROOT = process.cwd();
export const LOCAL_PACKAGE_DIR = path.join(
  PROJECT_ROOT,
  'packages',
  'better-convex'
);
export const LOCAL_RESEND_PACKAGE_DIR = path.join(
  PROJECT_ROOT,
  'packages',
  'resend'
);
export const LOCAL_CLI_PATH = path.join(
  PROJECT_ROOT,
  'packages',
  'better-convex',
  'dist',
  'cli.mjs'
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
export const DEFAULT_LOCAL_DEV_PORT = 3005;
const TRAILING_NEWLINES_RE = /\n*$/;
const SCRIPT_PORT_FLAG_RE = /(?:^|\s)--port(?:=|\s)\d+\b/;
const NEXT_DEV_SCRIPT_RE = /\bnext\s+dev\b/;
const VITE_DEV_SCRIPT_RE = /^vite(?:\s|$)/;
const ENV_ASSIGNMENT_RE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
const GET_ENV_SITE_URL_DEFAULT_RE =
  /SITE_URL:\s*z\.string\(\)\.default\((['"])http:\/\/localhost:3000\1\)/;
const NEXT_PUBLIC_SITE_URL_ENV_RE =
  /NEXT_PUBLIC_(?:CONVEX_URL|CONVEX_SITE_URL|SITE_URL)=/;
const VITE_SITE_URL_ENV_RE = /VITE_(?:CONVEX_URL|CONVEX_SITE_URL|SITE_URL)=/;
const BUILT_LOCAL_PACKAGE_DIRS = new Set<string>();
let localBetterConvexInstallSpec: string | undefined;
let localResendInstallSpec: string | undefined;

const resolveLocalDevSiteUrl = (port: number) => `http://localhost:${port}`;

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
    nodeBinary?: string;
    localCliPath?: string;
  }
) => {
  ensureLocalBetterConvexBuild();

  return [
    params.nodeBinary ?? Bun.which('node') ?? process.execPath,
    params.localCliPath ?? LOCAL_CLI_PATH,
    '--backend',
    params.backend,
    ...args,
  ];
};

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

const createPackableLocalResendPackageDir = () => {
  const tempRoot = mkdtempSync(
    path.join(tmpdir(), 'better-convex-resend-pack-')
  );
  const packageDir = path.join(tempRoot, 'package');
  cpSync(
    path.join(LOCAL_RESEND_PACKAGE_DIR, 'dist'),
    path.join(packageDir, 'dist'),
    { recursive: true }
  );

  const packageJsonPath = path.join(packageDir, 'package.json');
  const packageJson = readJson<WorkspacePackageJson>(
    path.join(LOCAL_RESEND_PACKAGE_DIR, 'package.json')
  );
  if (packageJson.dependencies?.['better-convex']) {
    packageJson.dependencies['better-convex'] =
      getLocalBetterConvexInstallSpec();
    writeJson(packageJsonPath, packageJson);
  }

  return packageDir;
};

export const getLocalResendInstallSpec = () => {
  if (localResendInstallSpec) {
    return localResendInstallSpec;
  }

  const outputDir = mkdtempSync(
    path.join(tmpdir(), 'better-convex-local-resend-install-spec-')
  );
  const packageDir = createPackableLocalResendPackageDir();
  localResendInstallSpec = packLocalBetterConvexPackage(outputDir, packageDir, {
    skipBuild: true,
  });
  return localResendInstallSpec;
};

export const runLocalCliSteps = async (
  steps: ReadonlyArray<readonly string[]>,
  cwd: string,
  params: {
    backend: TemplateBackend;
    nodeBinary?: string;
    localCliPath?: string;
    runCommand?: typeof run;
  }
) => {
  const runCommand = params.runCommand ?? run;

  for (const step of steps) {
    await runCommand(buildLocalCliCommand(step, params), cwd, {
      env: {
        [BETTER_CONVEX_INSTALL_SPEC_ENV]: getLocalBetterConvexInstallSpec(),
        [BETTER_CONVEX_RESEND_INSTALL_SPEC_ENV]: getLocalResendInstallSpec(),
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
        'init',
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
        [BETTER_CONVEX_RESEND_INSTALL_SPEC_ENV]: getLocalResendInstallSpec(),
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
  packageDir = LOCAL_PACKAGE_DIR,
  options: {
    skipBuild?: boolean;
  } = {}
) => {
  if (!options.skipBuild) {
    ensureLocalBetterConvexBuild(packageDir);
  }

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

const normalizeLocalDevScript = (script: string | undefined, port: number) => {
  if (!script) {
    return script;
  }

  if (!NEXT_DEV_SCRIPT_RE.test(script) && !VITE_DEV_SCRIPT_RE.test(script)) {
    return script;
  }

  if (SCRIPT_PORT_FLAG_RE.test(script)) {
    return script.replace(SCRIPT_PORT_FLAG_RE, ` --port ${port}`);
  }

  return `${script} --port ${port}`;
};

const upsertEnvEntries = (
  filePath: string,
  entries: Record<string, string>,
  options: {
    createIfMissing?: boolean;
  } = {}
) => {
  if (!existsSync(filePath) && !options.createIfMissing) {
    return false;
  }

  const source = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const lines = source.split(LINE_SPLIT_RE);
  const pending = new Map(Object.entries(entries));
  const nextLines = lines.map((line) => {
    const match = line.match(ENV_ASSIGNMENT_RE);
    if (!match) {
      return line;
    }

    const [, key] = match;
    const nextValue = pending.get(key);
    if (nextValue === undefined) {
      return line;
    }

    pending.delete(key);
    return `${key}=${nextValue}`;
  });

  if (pending.size > 0) {
    const hasContent = nextLines.some((line) => line.trim().length > 0);
    if (hasContent && nextLines.at(-1)?.trim().length !== 0) {
      nextLines.push('');
    }
    for (const [key, value] of pending) {
      nextLines.push(`${key}=${value}`);
    }
  }

  const nextSource = `${nextLines.join('\n').replace(TRAILING_NEWLINES_RE, '')}\n`;
  if (nextSource === source) {
    return false;
  }

  writeFileSync(filePath, nextSource);
  return true;
};

export const patchPreparedLocalDevPort = (
  directory: string,
  port = DEFAULT_LOCAL_DEV_PORT
) => {
  const localDevSiteUrl = resolveLocalDevSiteUrl(port);
  const packageJsonPath = path.join(directory, 'package.json');
  if (existsSync(packageJsonPath)) {
    const packageJson = readJson<WorkspacePackageJson>(packageJsonPath);
    const nextScripts = { ...(packageJson.scripts ?? {}) };
    let packageJsonChanged = false;

    for (const scriptName of ['dev', 'dev:frontend'] as const) {
      const normalized = normalizeLocalDevScript(nextScripts[scriptName], port);
      if (normalized && normalized !== nextScripts[scriptName]) {
        nextScripts[scriptName] = normalized;
        packageJsonChanged = true;
      }
    }

    if (packageJsonChanged) {
      writeJson(packageJsonPath, {
        ...packageJson,
        scripts: nextScripts,
      });
    }
  }

  const envLocalPath = path.join(directory, '.env.local');
  if (existsSync(envLocalPath)) {
    const envLocalSource = readFileSync(envLocalPath, 'utf8');
    const envEntries: Record<string, string> = {};

    if (NEXT_PUBLIC_SITE_URL_ENV_RE.test(envLocalSource)) {
      envEntries.NEXT_PUBLIC_SITE_URL = localDevSiteUrl;
    }
    if (VITE_SITE_URL_ENV_RE.test(envLocalSource)) {
      envEntries.VITE_SITE_URL = localDevSiteUrl;
    }

    if (Object.keys(envEntries).length > 0) {
      upsertEnvEntries(envLocalPath, envEntries);
    }
  }

  upsertEnvEntries(path.join(directory, 'convex', '.env'), {
    SITE_URL: localDevSiteUrl,
  });

  const getEnvPath = path.join(directory, 'convex', 'lib', 'get-env.ts');
  if (existsSync(getEnvPath)) {
    const source = readFileSync(getEnvPath, 'utf8');
    const nextSource = source.replace(
      GET_ENV_SITE_URL_DEFAULT_RE,
      `SITE_URL: z.string().default('${localDevSiteUrl}')`
    );

    if (nextSource !== source) {
      writeFileSync(getEnvPath, nextSource);
    }
  }
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
