import fs from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { generateMeta } from './codegen.js';
import { loadBetterConvexConfig } from './config.js';
import { syncEnv } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve real convex CLI binary
// Can't use require.resolve('convex/bin/main.js') because it's not exported
// Use the path relative to the convex package
const require = createRequire(import.meta.url);
const convexPkg = require.resolve('convex/package.json');
const realConvex = join(dirname(convexPkg), 'bin/main.js');

export type ParsedArgs = {
  command: string;
  restArgs: string[];
  convexArgs: string[];
  debug: boolean;
  outputDir?: string;
  scope?: 'all' | 'auth' | 'orm';
  configPath?: string;
};

const VALID_SCOPES = new Set(['all', 'auth', 'orm']);

// Parse args: better-convex [command] [--api <dir>] [--scope <all|auth|orm>] [--config <path>] [--debug] [...convex-args]
export function parseArgs(argv: string[]): ParsedArgs {
  let debug = false;
  let outputDir: string | undefined;
  let scope: 'all' | 'auth' | 'orm' | undefined;
  let configPath: string | undefined;

  const filtered: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (a === '--debug') {
      debug = true;
      continue;
    }

    if (a === '--api') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --api.');
      }
      outputDir = value;
      i += 1; // skip value
      continue;
    }

    if (a === '--scope') {
      const value = argv[i + 1];
      if (!value || !VALID_SCOPES.has(value)) {
        throw new Error(
          `Invalid --scope value "${value ?? ''}". Expected one of: all, auth, orm.`
        );
      }
      scope = value as 'all' | 'auth' | 'orm';
      i += 1; // skip value
      continue;
    }

    if (a === '--config') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --config.');
      }
      configPath = value;
      i += 1; // skip value
      continue;
    }

    filtered.push(a);
  }

  const command = filtered[0] || 'dev';
  const restArgs = filtered.slice(1);

  return {
    command,
    restArgs,
    convexArgs: restArgs,
    debug,
    outputDir,
    scope,
    configPath,
  };
}

// Track child processes for cleanup
const processes: any[] = [];

function cleanup() {
  for (const proc of processes) {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
  }
}

export type RunDeps = {
  execa: typeof execa;
  generateMeta: typeof generateMeta;
  syncEnv: typeof syncEnv;
  loadBetterConvexConfig: typeof loadBetterConvexConfig;
  realConvex: string;
};

function deriveScopeFromToggles(
  api: boolean,
  auth: boolean
): 'all' | 'auth' | 'orm' | null {
  if (api && auth) return 'all';
  if (!api && auth) return 'auth';
  if (!api && !auth) return 'orm';
  return null;
}

export async function run(
  argv: string[],
  deps?: Partial<RunDeps>
): Promise<number> {
  const {
    execa: execaFn,
    generateMeta: generateMetaFn,
    syncEnv: syncEnvFn,
    loadBetterConvexConfig: loadBetterConvexConfigFn,
    realConvex: realConvexPath,
  } = {
    execa,
    generateMeta,
    syncEnv,
    loadBetterConvexConfig,
    realConvex,
    ...deps,
  };

  const {
    command,
    restArgs,
    convexArgs,
    debug: cliDebug,
    outputDir: cliOutputDir,
    scope: cliScope,
    configPath,
  } = parseArgs(argv);

  if (command === 'dev') {
    if (cliScope) {
      throw new Error(
        '`--scope` is not supported for `better-convex dev`. Use `better-convex codegen --scope <all|auth|orm>` for scoped generation.'
      );
    }
    const config = loadBetterConvexConfigFn(configPath);
    const outputDir = cliOutputDir ?? config.outputDir;
    const debug = cliDebug || config.dev.debug;
    const generateApi = config.api;
    const generateAuth = config.auth;
    const convexDevArgs = [...config.dev.convexArgs, ...convexArgs];

    // Initial codegen
    await generateMetaFn(outputDir, {
      debug,
      api: generateApi,
      auth: generateAuth,
    });

    // Spawn watcher as child process
    const isTs = __filename.endsWith('.ts');
    const watcherPath = isTs
      ? join(__dirname, 'watcher.ts')
      : join(__dirname, 'watcher.mjs');
    const runtime = isTs ? 'bun' : process.execPath;

    const watcherProcess = execaFn(runtime, [watcherPath], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: {
        ...process.env,
        BETTER_CONVEX_API_OUTPUT_DIR: outputDir || '',
        BETTER_CONVEX_DEBUG: debug ? '1' : '',
        BETTER_CONVEX_GENERATE_API: generateApi ? '1' : '0',
        BETTER_CONVEX_GENERATE_AUTH: generateAuth ? '1' : '0',
      },
    });
    processes.push(watcherProcess);

    // Spawn real convex dev
    const convexProcess = execaFn(
      'node',
      [realConvexPath, 'dev', ...convexDevArgs],
      {
        stdio: 'inherit',
        cwd: process.cwd(),
        reject: false, // Don't throw on non-zero exit
      }
    );
    processes.push(convexProcess);

    // Setup cleanup handlers
    process.on('exit', cleanup);
    process.on('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });

    // Wait for either to exit, then cleanup
    const result = await Promise.race([
      watcherProcess.catch(() => ({ exitCode: 1 })),
      convexProcess,
    ]);
    cleanup();
    return result.exitCode ?? 0;
  }
  if (command === 'codegen') {
    const config = loadBetterConvexConfigFn(configPath);
    const outputDir = cliOutputDir ?? config.outputDir;
    const debug = cliDebug || config.codegen.debug;
    const convexCodegenArgs = [...config.codegen.convexArgs, ...convexArgs];
    const scope = cliScope ?? config.codegen.scope;

    // Run better-convex codegen first
    if (scope) {
      await generateMetaFn(outputDir, { debug, scope });
    } else {
      const derivedScope = deriveScopeFromToggles(config.api, config.auth);
      if (derivedScope) {
        await generateMetaFn(outputDir, { debug, scope: derivedScope });
      } else {
        await generateMetaFn(outputDir, {
          debug,
          api: config.api,
          auth: config.auth,
        });
      }
    }

    // Then run real convex codegen
    const result = await execaFn(
      'node',
      [realConvexPath, 'codegen', ...convexCodegenArgs],
      {
        stdio: 'inherit',
        cwd: process.cwd(),
      }
    );
    return result.exitCode ?? 0;
  }
  if (command === 'env') {
    const subcommand = convexArgs[0];

    if (subcommand === 'sync') {
      // better-convex env sync [--auth] [--force] [--prod]
      const auth = restArgs.includes('--auth');
      const force = restArgs.includes('--force');
      const prod = restArgs.includes('--prod');
      await syncEnvFn({ auth, force, prod });
      return 0;
    }
    // Pass through to convex env (list, get, set, remove)
    const result = await execaFn(
      'node',
      [realConvexPath, 'env', ...convexArgs],
      {
        stdio: 'inherit',
        cwd: process.cwd(),
        reject: false,
      }
    );
    return result.exitCode ?? 0;
  }
  // Pass through to real convex CLI
  const result = await execaFn(
    'node',
    [realConvexPath, command, ...convexArgs],
    {
      stdio: 'inherit',
      cwd: process.cwd(),
      reject: false,
    }
  );
  return result.exitCode ?? 0;
}

export function isEntryPoint(
  entry: string | undefined,
  filename: string
): boolean {
  if (!entry) return false;
  // bin shims are often symlinks (e.g. node_modules/.bin/better-convex).
  // Comparing resolved paths without dereferencing symlinks makes the CLI no-op.
  try {
    return (
      resolve(fs.realpathSync(entry)) === resolve(fs.realpathSync(filename))
    );
  } catch {
    return resolve(entry) === resolve(filename);
  }
}

// Only run when executed directly (not when imported for tests).
const isMain = isEntryPoint(process.argv[1], __filename);

if (isMain) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      cleanup();
      console.error('Error:', error);
      process.exit(1);
    }
  );
}
