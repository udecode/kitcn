import fs from 'node:fs';
import { createServer } from 'node:http';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import {
  assertNoRemovedDevPreRunFlag,
  cleanup,
  createBackendAdapter,
  createBackendCommandEnv,
  createCommandEnv,
  extractBackendRunTargetArgs,
  extractBackfillCliOptions,
  extractConcaveRunTargetArgs,
  extractMigrationCliOptions,
  isConvexDevPreRunConflictFlag,
  parseArgs,
  type RunDeps,
  resolveBackfillConfig,
  resolveCodegenTrimSegments,
  resolveConfiguredBackend,
  resolveMigrationConfig,
  resolveRunDeps,
  runAggregateBackfillFlow,
  runConvexInitIfNeeded,
  runDevSchemaBackfillIfNeeded,
  runMigrationFlow,
  trackProcess,
} from '../backend-core.js';
import { stripConvexCommandNoise } from '../convex-command.js';
import { resolveAuthEnvState } from '../env.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HELP_FLAGS = new Set(['--help', '-h']);
const LOCAL_CONCAVE_HOST = '127.0.0.1';
const LOCAL_CONCAVE_DEV_PORT = 3210;
const LOCAL_CONCAVE_SITE_PORT = 3211;
const LOCAL_CONCAVE_DEV_URL = `http://${LOCAL_CONCAVE_HOST}:${LOCAL_CONCAVE_DEV_PORT}`;
const LOCAL_CONCAVE_SITE_URL = `http://${LOCAL_CONCAVE_HOST}:${LOCAL_CONCAVE_SITE_PORT}`;
const CONCAVE_DEV_STARTUP_MAX_ATTEMPTS = 4;
const DEV_STARTUP_RETRY_DELAY_CAP_MS = 30_000;
const DEV_FILE_WATCH_DEBOUNCE_MS = 200;
const DEV_BOOTSTRAP_FLAG = '--bootstrap';
const DEV_BOOTSTRAP_TYPECHECK_FLAG = '--typecheck';
const DEV_BOOTSTRAP_TYPECHECK_MODE = 'disable';
const DEV_READY_LINE_RE = /(Convex|Concave) functions ready!/i;
const DEV_SUPPRESSED_LINE_PATTERNS = [
  /WARN \[Better Auth\]: Rate limiting skipped: could not determine client IP address\./,
];
const SUPPORTED_LOCAL_CONVEX_NODE_MAJORS = new Set([18, 20, 22, 24]);
const LINE_SPLIT_RE = /\r?\n/;

type LocalSiteProxyHandle = {
  killed: boolean;
  kill: (signal?: string) => void;
};

type FileWatcherHandle = {
  close: () => Promise<void> | void;
  on: (...args: any[]) => any;
};

type LocalSiteProxyOptions = {
  listenHost: string;
  listenPort: number;
  targetOrigin: string;
};

type ConcaveLocalDevContract = {
  backendArgs: string[];
  targetArgs: string[];
  backendEnv?: Record<string, string>;
  siteProxy?: LocalSiteProxyOptions;
};

type DevDeps = Partial<RunDeps> & {
  resolveConcaveLocalSiteUrl?: (cwd?: string) => string;
  resolveSupportedLocalNodeEnvOverrides?: (params: {
    cwd?: string;
    currentNodeVersion?: string;
    env?: Record<string, string | undefined>;
    execaFn: RunDeps['execa'];
    runtimeName?: string;
  }) => Promise<Record<string, string | undefined>>;
  startLocalSiteProxy?: (
    options: LocalSiteProxyOptions
  ) => Promise<LocalSiteProxyHandle>;
};

type DevStartupRetryLogger = Pick<typeof logger, 'info'>;

type DevOutputStreamLike = {
  on: (
    event: 'data' | 'end' | 'close',
    cb: ((chunk: unknown) => void) | (() => void)
  ) => unknown;
};

type DevOutputProcessLike = {
  stderr?: DevOutputStreamLike;
  stdout?: DevOutputStreamLike;
};

type DevOutputMode = 'filtered' | 'raw';

type RunDevStartupRetryLoopParams = {
  backend: 'convex' | 'concave';
  label: string;
  runTask: () => Promise<number>;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  logger?: DevStartupRetryLogger;
};

type RunDevAuthEnvSyncLoopParams = {
  runTask: () => Promise<void>;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
};

type RunLocalConvexBootstrapParams = {
  authSyncMode?: 'auto' | 'complete';
  config: ReturnType<RunDeps['loadBetterConvexConfig']>;
  debug: boolean;
  devArgs?: string[];
  execaFn: RunDeps['execa'];
  generateMetaFn: RunDeps['generateMeta'];
  realConcavePath?: string;
  realConvexPath: string;
  sharedDir: string;
  skipGenerateMeta?: boolean;
  syncEnvFn: RunDeps['syncEnv'];
  targetArgs: string[];
};

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    signal?.addEventListener('abort', onAbort);
  });
}

function readWatchedFileSnapshot(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf8');
}

export function resolveDevStartupRetryDelayMs(retryAttempt: number): number {
  return Math.min(
    1000 * 2 ** Math.max(0, retryAttempt - 1),
    DEV_STARTUP_RETRY_DELAY_CAP_MS
  );
}

async function runDevAuthEnvSyncLoop({
  runTask,
  signal,
  sleep = sleepWithAbort,
}: RunDevAuthEnvSyncLoopParams): Promise<void> {
  for (
    let retryAttempt = 1;
    retryAttempt <= CONCAVE_DEV_STARTUP_MAX_ATTEMPTS;
    retryAttempt += 1
  ) {
    if (signal?.aborted) {
      return;
    }

    try {
      await runTask();
      return;
    } catch (error) {
      if (retryAttempt >= CONCAVE_DEV_STARTUP_MAX_ATTEMPTS) {
        throw error;
      }
      await sleep(resolveDevStartupRetryDelayMs(retryAttempt), signal);
    }
  }
}

export function filterDevStartupLine(
  rawLine: string
):
  | { kind: 'skip' }
  | { kind: 'ready'; message: string }
  | { kind: 'pass'; line: string } {
  const line = stripConvexCommandNoise(rawLine).trim();
  if (!line) {
    return { kind: 'skip' };
  }
  if (DEV_SUPPRESSED_LINE_PATTERNS.some((pattern) => pattern.test(line))) {
    return { kind: 'skip' };
  }
  if (
    line.includes('Finished running function "init"') ||
    line.includes('CONVEX_AGENT_MODE=anonymous mode is in beta') ||
    line.includes('Convex AI files are not installed.') ||
    line.includes('Preparing Convex functions...') ||
    line.includes('Bundling component schemas and implementations') ||
    line.includes('Uploading functions to Convex')
  ) {
    return { kind: 'skip' };
  }
  if (DEV_READY_LINE_RE.test(line)) {
    return {
      kind: 'ready',
      message: line.toLowerCase().includes('concave')
        ? 'Concave ready'
        : 'Convex ready',
    };
  }
  return { kind: 'pass', line };
}

function isDevOutputProcessLike(value: unknown): value is DevOutputProcessLike {
  return typeof value === 'object' && value !== null;
}

function observeDevProcessOutput(
  child: unknown,
  mode: DevOutputMode
): Promise<boolean> {
  if (!isDevOutputProcessLike(child)) {
    return Promise.resolve(true);
  }
  if (!child.stdout && !child.stderr) {
    return Promise.resolve(true);
  }

  let settled = false;
  let readyLogged = false;
  let processExited = false;
  let openStreamCount = 0;
  return new Promise<boolean>((resolve) => {
    const settle = (ready: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(ready);
    };

    const maybeSettleAfterExit = () => {
      if (processExited && openStreamCount === 0) {
        settle(false);
      }
    };

    const attach = (
      stream: DevOutputStreamLike | undefined,
      sink: NodeJS.WriteStream
    ) => {
      if (!stream) {
        return;
      }

      openStreamCount += 1;

      let pending = '';
      let closed = false;
      const flushLine = (line: string) => {
        if (mode === 'raw') {
          const normalizedLine = line.replaceAll('\r', '');
          if (
            DEV_SUPPRESSED_LINE_PATTERNS.some((pattern) =>
              pattern.test(normalizedLine)
            )
          ) {
            return;
          }
          if (DEV_READY_LINE_RE.test(normalizedLine)) {
            settle(true);
          }
          sink.write(
            normalizedLine.endsWith('\n')
              ? normalizedLine
              : `${normalizedLine}\n`
          );
          return;
        }

        const filtered = filterDevStartupLine(line);
        if (filtered.kind === 'skip') {
          return;
        }
        if (filtered.kind === 'ready') {
          if (!readyLogged) {
            readyLogged = true;
            logger.success(filtered.message);
          }
          settle(true);
          return;
        }
        sink.write(
          filtered.line.endsWith('\n') ? filtered.line : `${filtered.line}\n`
        );
      };
      const flushPendingAndClose = () => {
        if (closed) {
          return;
        }
        closed = true;
        if (pending.length > 0) {
          flushLine(pending);
          pending = '';
        }
        openStreamCount -= 1;
        maybeSettleAfterExit();
      };

      stream.on('data', (chunk) => {
        pending += String(chunk).replaceAll('\r', '');
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) {
          flushLine(line);
        }
      });
      stream.on('end', flushPendingAndClose);
      stream.on('close', flushPendingAndClose);
    };

    attach(child.stdout, process.stdout);
    attach(child.stderr, process.stderr);

    if (typeof (child as PromiseLike<unknown>).then === 'function') {
      (child as PromiseLike<unknown>).then(
        () => {
          processExited = true;
          maybeSettleAfterExit();
        },
        () => {
          processExited = true;
          maybeSettleAfterExit();
        }
      );
      return;
    }

    processExited = true;
    maybeSettleAfterExit();
  });
}

function extractDevBootstrapCliFlag(args: string[]): {
  bootstrap: boolean;
  remainingArgs: string[];
} {
  let bootstrap = false;
  const remainingArgs: string[] = [];

  for (const arg of args) {
    if (arg === DEV_BOOTSTRAP_FLAG) {
      bootstrap = true;
      continue;
    }
    remainingArgs.push(arg);
  }

  return {
    bootstrap,
    remainingArgs,
  };
}

function hasDevArg(args: string[], flag: string): boolean {
  return args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
}

function applyConvexBootstrapDevArgs(args: string[]): string[] {
  const nextArgs = [...args];
  if (!hasDevArg(nextArgs, '--once')) {
    nextArgs.push('--once');
  }
  if (!hasDevArg(nextArgs, DEV_BOOTSTRAP_TYPECHECK_FLAG)) {
    nextArgs.push(DEV_BOOTSTRAP_TYPECHECK_FLAG, DEV_BOOTSTRAP_TYPECHECK_MODE);
  }
  return nextArgs;
}

function killProcessIfRunning(process: unknown, signal = 'SIGTERM') {
  if (
    typeof process === 'object' &&
    process !== null &&
    'killed' in process &&
    !(process as { killed: boolean }).killed &&
    'kill' in process &&
    typeof (process as { kill: (signal?: string) => void }).kill === 'function'
  ) {
    (process as { kill: (signal?: string) => void }).kill(signal);
  }
}

export async function runLocalConvexBootstrap({
  authSyncMode = 'complete',
  config,
  debug,
  devArgs = [],
  execaFn,
  generateMetaFn,
  realConcavePath,
  realConvexPath,
  sharedDir,
  skipGenerateMeta = false,
  syncEnvFn,
  targetArgs,
}: RunLocalConvexBootstrapParams): Promise<number> {
  if (!debug) {
    logger.info('Bootstrapping local Convex...');
  }
  const backendAdapter = createBackendAdapter({
    backend: 'convex',
    realConvexPath,
    realConcavePath,
  });
  const trimSegments = resolveCodegenTrimSegments(config);
  const localConvexEnvPath = join(
    process.cwd(),
    config.paths.lib,
    '..',
    '.env'
  );
  const authEnvState = resolveAuthEnvState({
    cwd: process.cwd(),
    sharedDir,
  });
  const localNodeEnvOverrides = await resolveSupportedLocalNodeEnvOverrides({
    execaFn,
  });

  const convexInitResult = await runConvexInitIfNeeded({
    execaFn,
    backendAdapter,
    echoOutput: false,
    env: localNodeEnvOverrides,
    targetArgs,
  });
  if (convexInitResult.exitCode !== 0) {
    return convexInitResult.exitCode;
  }

  if (fs.existsSync(localConvexEnvPath) || authEnvState.installed) {
    await syncEnvFn({
      authSyncMode: authEnvState.installed ? 'prepare' : 'skip',
      force: true,
      sharedDir,
      silent: true,
      targetArgs,
    });
  }

  if (!skipGenerateMeta) {
    await generateMetaFn(sharedDir, {
      debug,
      silent: true,
      scope: 'all',
      trimSegments,
    });
  }

  const bootstrapProcess = execaFn(
    backendAdapter.command,
    [
      ...backendAdapter.argsPrefix,
      'dev',
      ...applyConvexBootstrapDevArgs(devArgs),
    ],
    {
      stdio: 'pipe',
      cwd: process.cwd(),
      env: createBackendCommandEnv(localNodeEnvOverrides),
      reject: false,
    }
  );
  const backendReadyPromise = observeDevProcessOutput(
    bootstrapProcess,
    debug ? 'raw' : 'filtered'
  );
  const abortController = new AbortController();

  const authEnvSyncPromise = authEnvState.installed
    ? (async () => {
        const ready = await backendReadyPromise;
        if (!ready || abortController.signal.aborted) {
          return;
        }
        await runDevAuthEnvSyncLoop({
          signal: abortController.signal,
          runTask: () =>
            syncEnvFn({
              authSyncMode,
              force: true,
              sharedDir,
              silent: true,
              targetArgs,
            }),
        });
      })()
    : null;

  const migrationPromise =
    config.dev.migrations.enabled !== 'off'
      ? (async () => {
          try {
            const ready = await backendReadyPromise;
            if (!ready || abortController.signal.aborted) {
              return;
            }
            const exitCode = await runDevStartupRetryLoop({
              backend: 'convex',
              label: 'migration up',
              signal: abortController.signal,
              runTask: () =>
                runMigrationFlow({
                  execaFn,
                  backendAdapter,
                  migrationConfig: config.dev.migrations,
                  targetArgs,
                  signal: abortController.signal,
                  context: 'dev',
                  direction: 'up',
                }),
            });
            if (exitCode !== 0 && !abortController.signal.aborted) {
              logger.warn(
                '⚠️  migration up failed in bootstrap (continuing without blocking).'
              );
            }
          } catch (error) {
            if (!abortController.signal.aborted) {
              logger.warn(
                `⚠️  migration up errored in bootstrap: ${(error as Error).message}`
              );
            }
          }
        })()
      : null;

  const backfillPromise =
    config.dev.aggregateBackfill.enabled !== 'off'
      ? (async () => {
          try {
            const ready = await backendReadyPromise;
            if (!ready || abortController.signal.aborted) {
              return;
            }
            const exitCode = await runDevStartupRetryLoop({
              backend: 'convex',
              label: 'aggregateBackfill kickoff',
              signal: abortController.signal,
              runTask: () =>
                runAggregateBackfillFlow({
                  execaFn,
                  backendAdapter,
                  backfillConfig: config.dev.aggregateBackfill,
                  mode: 'resume',
                  targetArgs,
                  signal: abortController.signal,
                  context: 'dev',
                }),
            });
            if (exitCode !== 0 && !abortController.signal.aborted) {
              logger.warn(
                '⚠️  aggregateBackfill kickoff failed in bootstrap (continuing without blocking).'
              );
            }
          } catch (error) {
            if (!abortController.signal.aborted) {
              logger.warn(
                `⚠️  aggregateBackfill kickoff errored in bootstrap: ${(error as Error).message}`
              );
            }
          }
        })()
      : null;

  try {
    const result = await bootstrapProcess;
    await backendReadyPromise;
    if (authEnvSyncPromise) {
      await authEnvSyncPromise;
    }
    await migrationPromise;
    await backfillPromise;
    return result.exitCode ?? 0;
  } finally {
    abortController.abort();
    killProcessIfRunning(bootstrapProcess);
  }
}

function applyConvexDevPreRunArgs(
  args: string[],
  preRunFunction?: string
): string[] {
  if (!preRunFunction) {
    return args;
  }

  return ['--run', preRunFunction, ...args];
}

export async function runDevStartupRetryLoop({
  backend,
  label,
  runTask,
  signal,
  sleep = sleepWithAbort,
  logger: retryLogger = logger,
}: RunDevStartupRetryLoopParams): Promise<number> {
  const maxAttempts =
    backend === 'concave' ? CONCAVE_DEV_STARTUP_MAX_ATTEMPTS : 1;
  let attempt = 1;

  while (true) {
    try {
      const exitCode = await runTask();
      if (exitCode === 0 || attempt >= maxAttempts || signal?.aborted) {
        return exitCode;
      }
    } catch (error) {
      if (attempt >= maxAttempts || signal?.aborted) {
        throw error;
      }
    }

    attempt += 1;
    retryLogger.info(`↻ ${label} retry ${attempt}/${maxAttempts}`);
    await sleep(resolveDevStartupRetryDelayMs(attempt - 1), signal);
  }
}

export function resolveConcaveLocalSiteUrl(cwd = process.cwd()): string {
  const envLocalPath = join(cwd, '.env.local');
  if (!fs.existsSync(envLocalPath)) {
    return 'http://localhost:3000';
  }

  const parsed = parseEnv(fs.readFileSync(envLocalPath, 'utf8'));
  return (
    parsed.NEXT_PUBLIC_SITE_URL ??
    parsed.VITE_SITE_URL ??
    'http://localhost:3000'
  );
}

export const resolveWatcherCommand = (
  currentFilename = __filename,
  currentDir = __dirname
) => {
  const isTs = currentFilename.endsWith('.ts');

  return {
    runtime: isTs ? 'bun' : 'node',
    watcherPath: isTs
      ? join(currentDir, '..', 'watcher.ts')
      : join(currentDir, 'watcher.mjs'),
  };
};

const LEADING_NODE_VERSION_PREFIX_RE = /^v/;

function parseNodeMajor(version: string | undefined): number | null {
  if (!version) {
    return null;
  }

  const majorText = version
    .trim()
    .replace(LEADING_NODE_VERSION_PREFIX_RE, '')
    .split('.')[0];
  const major = Number.parseInt(majorText, 10);
  return Number.isFinite(major) ? major : null;
}

function prependPathEntry(
  currentPath: string | undefined,
  entry: string
): string {
  const normalizedEntry = resolve(entry);
  const entries = (currentPath ?? '')
    .split(delimiter)
    .filter((segment) => segment.length > 0)
    .filter((segment) => resolve(segment) !== normalizedEntry);

  return [entry, ...entries].join(delimiter);
}

export async function resolveSupportedLocalNodeEnvOverrides({
  cwd = process.cwd(),
  currentNodeVersion = process.version,
  env,
  execaFn,
  runtimeName = process.release?.name ?? 'node',
}: {
  cwd?: string;
  currentNodeVersion?: string;
  env?: Record<string, string | undefined>;
  execaFn: RunDeps['execa'];
  runtimeName?: string;
}): Promise<Record<string, string | undefined>> {
  if (runtimeName !== 'node') {
    return {};
  }

  const currentMajor = parseNodeMajor(currentNodeVersion);
  if (
    currentMajor !== null &&
    SUPPORTED_LOCAL_CONVEX_NODE_MAJORS.has(currentMajor)
  ) {
    return {};
  }

  const baseEnv = createCommandEnv(env);
  const whichResult = await execaFn('which', ['-a', 'node'], {
    cwd,
    env: baseEnv,
    reject: false,
    stdio: 'pipe',
  });
  if ((whichResult.exitCode ?? 0) !== 0) {
    return {};
  }

  const candidates = [
    ...new Set(
      (whichResult.stdout ?? '')
        .split(LINE_SPLIT_RE)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    ),
  ];

  for (const candidate of candidates) {
    const versionResult = await execaFn(
      candidate,
      ['-p', 'process.versions.node'],
      {
        cwd,
        env: baseEnv,
        reject: false,
        stdio: 'pipe',
      }
    );
    if ((versionResult.exitCode ?? 0) !== 0) {
      continue;
    }

    const candidateMajor = parseNodeMajor(versionResult.stdout ?? '');
    if (
      candidateMajor !== null &&
      SUPPORTED_LOCAL_CONVEX_NODE_MAJORS.has(candidateMajor)
    ) {
      return {
        PATH: prependPathEntry(baseEnv.PATH, dirname(candidate)),
      };
    }
  }

  return {};
}

function readRequestBody(
  request: AsyncIterable<Uint8Array>
): Promise<ArrayBuffer> {
  return (async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);
    return body.buffer.slice(
      body.byteOffset,
      body.byteOffset + body.byteLength
    );
  })();
}

function normalizeConcaveDevUrlArg(args: string[]): {
  backendArgs: string[];
  targetArgs: string[];
} | null {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const inlineValue = arg.startsWith('--url=') ? arg.slice(6) : undefined;
    const nextValue = arg === '--url' ? args[i + 1] : undefined;
    const urlValue = inlineValue ?? nextValue;
    if (!urlValue) {
      continue;
    }
    const url = new URL(urlValue);
    const port =
      url.port || (url.protocol === 'https:' ? String(443) : String(80));
    const backendArgs = [...args];
    if (inlineValue !== undefined) {
      backendArgs.splice(i, 1, `--port=${port}`);
    } else {
      backendArgs.splice(i, 2, '--port', port);
    }
    return {
      backendArgs,
      targetArgs: extractConcaveRunTargetArgs(args),
    };
  }
  return null;
}

export function resolveConcaveLocalDevContract(
  args: string[],
  frontendSiteUrl = 'http://localhost:3000'
): ConcaveLocalDevContract {
  const explicitTargetArgs = extractConcaveRunTargetArgs(args);
  if (explicitTargetArgs.length > 0) {
    return (
      normalizeConcaveDevUrlArg(args) ?? {
        backendArgs: args,
        targetArgs: explicitTargetArgs,
      }
    );
  }

  return {
    backendArgs: args,
    targetArgs: ['--url', LOCAL_CONCAVE_DEV_URL],
    backendEnv: {
      CONVEX_SITE_URL: LOCAL_CONCAVE_SITE_URL,
      SITE_URL: frontendSiteUrl,
    },
    siteProxy: {
      listenHost: LOCAL_CONCAVE_HOST,
      listenPort: LOCAL_CONCAVE_SITE_PORT,
      targetOrigin: LOCAL_CONCAVE_DEV_URL,
    },
  };
}

export async function startLocalSiteProxy(
  options: LocalSiteProxyOptions
): Promise<LocalSiteProxyHandle> {
  const server = createServer(async (request, response) => {
    try {
      const targetUrl = new URL(request.url ?? '/', options.targetOrigin);
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (
          value === undefined ||
          key === 'host' ||
          key === 'connection' ||
          key === 'content-length'
        ) {
          continue;
        }
        if (Array.isArray(value)) {
          for (const entry of value) {
            headers.append(key, entry);
          }
          continue;
        }
        headers.set(key, value);
      }
      const body =
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : await readRequestBody(request);
      const upstream = await fetch(targetUrl, {
        method: request.method,
        headers,
        body,
      });
      response.statusCode = upstream.status;
      for (const [key, value] of upstream.headers) {
        if (key === 'connection' || key === 'transfer-encoding') {
          continue;
        }
        response.setHeader(key, value);
      }
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      response.statusCode = 502;
      response.end(`Local site proxy error: ${(error as Error).message}`);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.listenPort, options.listenHost, () => {
      server.off('error', reject);
      resolve();
    });
  });

  logger.info(
    `concave site proxy ready at http://${options.listenHost}:${options.listenPort}`
  );

  const proxyHandle: LocalSiteProxyHandle = {
    killed: false,
    kill() {
      if (proxyHandle.killed) {
        return;
      }
      proxyHandle.killed = true;
      void new Promise((resolve) => {
        server.close(() => resolve(undefined));
      });
    },
  };

  return proxyHandle;
}

export const DEV_HELP_TEXT = `Usage: better-convex dev [options]

Options:
  --api <dir>             Output directory (default from config)
  --backend <convex|concave>
                          Backend CLI to drive
  --bootstrap             Run one-shot local Convex bootstrap and exit
  --config <path>         Config path override
  --backfill=auto|on|off  Dev aggregate backfill mode toggle
  --backfill-wait         Wait for aggregate backfill completion
  --no-backfill-wait      Skip waiting for aggregate backfill
  --migrations=auto|on|off
                          Dev migration mode toggle
  --migrations-wait       Wait for migration completion
  --no-migrations-wait    Skip waiting for migration completion`;

export const handleDevCommand = async (argv: string[], deps?: DevDeps) => {
  const parsed = parseArgs(argv);
  if (
    HELP_FLAGS.has(argv[0] ?? '') ||
    HELP_FLAGS.has(parsed.restArgs[0] ?? '')
  ) {
    logger.write(DEV_HELP_TEXT);
    return 0;
  }

  if (parsed.scope) {
    throw new Error(
      '`--scope` is not supported for `better-convex dev`. Use `better-convex codegen --scope <all|auth|orm>` for scoped generation.'
    );
  }

  const {
    execa: execaFn,
    generateMeta: generateMetaFn,
    getConvexConfig: getConvexConfigFn,
    loadBetterConvexConfig: loadBetterConvexConfigFn,
    ensureConvexGitignoreEntry: ensureConvexGitignoreEntryFn,
    enableDevSchemaWatch,
    syncEnv: syncEnvFn,
    realConvex: realConvexPath,
    realConcave: realConcavePath,
  } = resolveRunDeps(deps);
  const startLocalSiteProxyFn =
    deps?.startLocalSiteProxy ?? startLocalSiteProxy;
  const resolveSupportedLocalNodeEnvOverridesFn =
    deps?.resolveSupportedLocalNodeEnvOverrides ??
    resolveSupportedLocalNodeEnvOverrides;

  assertNoRemovedDevPreRunFlag(argv);

  const config = loadBetterConvexConfigFn(parsed.configPath);
  const backend = resolveConfiguredBackend({
    backendArg: parsed.backend,
    config,
  });
  const {
    remainingArgs: devArgsWithoutMigrationFlags,
    overrides: devMigrationOverrides,
  } = extractMigrationCliOptions(parsed.convexArgs);
  const { remainingArgs: devCommandArgs, overrides: devBackfillOverrides } =
    extractBackfillCliOptions(devArgsWithoutMigrationFlags);
  const sharedDir = parsed.sharedDir ?? config.paths.shared;
  const debug = parsed.debug || config.dev.debug;
  assertNoRemovedDevPreRunFlag(config.dev.args);
  const { bootstrap, remainingArgs: convexDevArgs } =
    extractDevBootstrapCliFlag([...config.dev.args, ...devCommandArgs]);
  const preRunFunction = config.dev.preRun;
  if (bootstrap && backend !== 'convex') {
    throw new Error(
      '`better-convex dev --bootstrap` is only supported for backend convex.'
    );
  }
  if (preRunFunction && backend === 'concave') {
    throw new Error(
      '`dev.preRun` is only supported for backend convex. Concave dev has no equivalent `--run` flow.'
    );
  }
  if (
    preRunFunction &&
    convexDevArgs.some((arg) => isConvexDevPreRunConflictFlag(arg))
  ) {
    throw new Error(
      '`dev.preRun` cannot be combined with Convex dev run flags (`--run`, `--run-sh`, `--run-component`).'
    );
  }

  const backendAdapter = createBackendAdapter({
    backend,
    realConvexPath,
    realConcavePath,
  });
  const devBackfillConfig = resolveBackfillConfig(
    config.dev.aggregateBackfill,
    devBackfillOverrides
  );
  const devMigrationConfig = resolveMigrationConfig(
    config.dev.migrations,
    devMigrationOverrides
  );
  const { functionsDir } = getConvexConfigFn(sharedDir);
  const schemaPath = join(functionsDir, 'schema.ts');
  const concaveLocalDevContract =
    backend === 'concave'
      ? resolveConcaveLocalDevContract(
          convexDevArgs,
          (deps?.resolveConcaveLocalSiteUrl ?? resolveConcaveLocalSiteUrl)(
            process.cwd()
          )
        )
      : null;
  const backendDevArgs =
    concaveLocalDevContract?.backendArgs ??
    applyConvexDevPreRunArgs(convexDevArgs, preRunFunction);
  const backendOutputMode: DevOutputMode =
    debug || (backend === 'convex' && !hasDevArg(backendDevArgs, '--once'))
      ? 'raw'
      : 'filtered';
  const targetArgs =
    concaveLocalDevContract?.targetArgs ??
    extractBackendRunTargetArgs(backend, convexDevArgs);
  const trimSegments = resolveCodegenTrimSegments(config);
  const localNodeEnvOverrides =
    backend === 'convex'
      ? await resolveSupportedLocalNodeEnvOverridesFn({
          execaFn,
        })
      : {};

  if (!bootstrap && backend === 'convex' && !debug) {
    logger.info('Bootstrapping local Convex...');
  }

  if (bootstrap) {
    return runLocalConvexBootstrap({
      authSyncMode: 'complete',
      config,
      debug,
      devArgs: backendDevArgs,
      execaFn,
      generateMetaFn,
      realConvexPath,
      realConcavePath,
      sharedDir,
      syncEnvFn,
      targetArgs,
    });
  }

  if (!deps) {
    try {
      ensureConvexGitignoreEntryFn(process.cwd());
    } catch (error) {
      logger.warn(
        `⚠️  Failed to ensure .convex/ and .concave/ are ignored in .gitignore: ${(error as Error).message}`
      );
    }
  }

  const convexInitResult = await runConvexInitIfNeeded({
    execaFn,
    backendAdapter,
    echoOutput: false,
    env: localNodeEnvOverrides,
    targetArgs,
  });
  if (convexInitResult.exitCode !== 0) {
    return convexInitResult.exitCode;
  }

  const localConvexEnvPath = join(
    process.cwd(),
    config.paths.lib,
    '..',
    '.env'
  );
  const authEnvState = resolveAuthEnvState({
    cwd: process.cwd(),
    sharedDir,
  });
  if (
    backend === 'convex' &&
    (fs.existsSync(localConvexEnvPath) || authEnvState.installed)
  ) {
    await syncEnvFn({
      authSyncMode: authEnvState.installed ? 'prepare' : 'skip',
      force: true,
      sharedDir,
      silent: true,
      targetArgs,
    });
  }

  await generateMetaFn(sharedDir, {
    debug,
    silent: true,
    scope: 'all',
    trimSegments,
  });

  const { runtime, watcherPath } = resolveWatcherCommand();

  const watcherProcess = execaFn(runtime, [watcherPath], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: {
      ...createCommandEnv(localNodeEnvOverrides),
      BETTER_CONVEX_API_OUTPUT_DIR: sharedDir || '',
      BETTER_CONVEX_DEBUG: debug ? '1' : '',
      BETTER_CONVEX_CODEGEN_SCOPE: 'all',
      BETTER_CONVEX_CODEGEN_TRIM_SEGMENTS: JSON.stringify(trimSegments),
    },
  });
  trackProcess(watcherProcess);

  const siteProxy = concaveLocalDevContract?.siteProxy
    ? await startLocalSiteProxyFn(concaveLocalDevContract.siteProxy)
    : null;
  if (siteProxy) {
    trackProcess(siteProxy);
  }

  const backendProcess = execaFn(
    backendAdapter.command,
    [...backendAdapter.argsPrefix, 'dev', ...backendDevArgs],
    {
      stdio: 'pipe',
      cwd: process.cwd(),
      env: createBackendCommandEnv({
        ...localNodeEnvOverrides,
        ...concaveLocalDevContract?.backendEnv,
      }),
      reject: false,
    }
  );
  const backendReadyPromise = observeDevProcessOutput(
    backendProcess,
    backendOutputMode
  );
  trackProcess(backendProcess);

  const backfillAbortController = new AbortController();

  const authEnvSyncPromise =
    backend === 'convex' && authEnvState.installed
      ? (async () => {
          const ready = await backendReadyPromise;
          if (!ready || backfillAbortController.signal.aborted) {
            return;
          }
          await runDevAuthEnvSyncLoop({
            signal: backfillAbortController.signal,
            runTask: () =>
              syncEnvFn({
                authSyncMode: 'complete',
                force: true,
                sharedDir,
                silent: true,
                targetArgs,
              }),
          });
        })()
      : null;
  const authEnvSyncFailurePromise: Promise<never> = authEnvSyncPromise
    ? authEnvSyncPromise.then(() => new Promise<never>(() => {}))
    : new Promise<never>(() => {});
  let envWatcher: FileWatcherHandle | null = null;
  let schemaWatcher: FileWatcherHandle | null = null;
  let envDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let schemaDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let schemaBackfillInFlight: Promise<void> | null = null;
  let schemaBackfillQueued = false;
  let lastSyncedLocalEnvSnapshot = readWatchedFileSnapshot(localConvexEnvPath);

  const maybeRunSchemaBackfill = async () => {
    try {
      const exitCode = await runDevSchemaBackfillIfNeeded({
        execaFn,
        backendAdapter,
        backfillConfig: devBackfillConfig,
        functionsDir,
        targetArgs,
        signal: backfillAbortController.signal,
      });
      if (exitCode !== 0 && !backfillAbortController.signal.aborted) {
        logger.warn(
          '⚠️  aggregateBackfill on schema update failed in dev (continuing without blocking).'
        );
      }
    } catch (error) {
      if (!backfillAbortController.signal.aborted) {
        logger.warn(
          `⚠️  aggregateBackfill on schema update errored in dev: ${(error as Error).message}`
        );
      }
    }
  };

  const queueSchemaBackfill = () => {
    if (backfillAbortController.signal.aborted) {
      return;
    }
    schemaBackfillQueued = true;
    if (schemaBackfillInFlight) {
      return;
    }
    schemaBackfillInFlight = (async () => {
      while (schemaBackfillQueued && !backfillAbortController.signal.aborted) {
        schemaBackfillQueued = false;
        await maybeRunSchemaBackfill();
      }
    })().finally(() => {
      schemaBackfillInFlight = null;
    });
  };

  const syncWatchedLocalEnv = async () => {
    const currentSnapshot = readWatchedFileSnapshot(localConvexEnvPath);
    if (
      backfillAbortController.signal.aborted ||
      currentSnapshot === lastSyncedLocalEnvSnapshot
    ) {
      return;
    }

    try {
      await authEnvSyncPromise;
      await syncEnvFn({
        authSyncMode: 'auto',
        force: true,
        sharedDir,
        silent: true,
        targetArgs,
      });
      lastSyncedLocalEnvSnapshot = readWatchedFileSnapshot(localConvexEnvPath);
    } catch (error) {
      if (!backfillAbortController.signal.aborted) {
        logger.warn(
          `⚠️  env push on convex/.env update failed in dev: ${(error as Error).message}`
        );
      }
    }
  };

  const queueLocalEnvSync = () => {
    if (backfillAbortController.signal.aborted) {
      return;
    }
    if (envDebounceTimer) {
      clearTimeout(envDebounceTimer);
    }
    envDebounceTimer = setTimeout(() => {
      void syncWatchedLocalEnv();
    }, DEV_FILE_WATCH_DEBOUNCE_MS);
  };

  if (devMigrationConfig.enabled !== 'off') {
    void (async () => {
      try {
        const ready = await backendReadyPromise;
        if (!ready || backfillAbortController.signal.aborted) {
          return;
        }
        const exitCode = await runDevStartupRetryLoop({
          backend,
          label: 'migration up',
          signal: backfillAbortController.signal,
          runTask: () =>
            runMigrationFlow({
              execaFn,
              backendAdapter,
              migrationConfig: devMigrationConfig,
              targetArgs,
              signal: backfillAbortController.signal,
              context: 'dev',
              direction: 'up',
            }),
        });
        if (exitCode !== 0 && !backfillAbortController.signal.aborted) {
          logger.warn(
            '⚠️  migration up failed in dev (continuing without blocking).'
          );
        }
      } catch (error) {
        if (!backfillAbortController.signal.aborted) {
          logger.warn(
            `⚠️  migration up errored in dev: ${(error as Error).message}`
          );
        }
      }
    })();
  }

  if (devBackfillConfig.enabled !== 'off') {
    void (async () => {
      try {
        const ready = await backendReadyPromise;
        if (!ready || backfillAbortController.signal.aborted) {
          return;
        }
        const exitCode = await runDevStartupRetryLoop({
          backend,
          label: 'aggregateBackfill kickoff',
          signal: backfillAbortController.signal,
          runTask: () =>
            runAggregateBackfillFlow({
              execaFn,
              backendAdapter,
              backfillConfig: devBackfillConfig,
              mode: 'resume',
              targetArgs,
              signal: backfillAbortController.signal,
              context: 'dev',
            }),
        });
        if (exitCode !== 0 && !backfillAbortController.signal.aborted) {
          logger.warn(
            '⚠️  aggregateBackfill kickoff failed in dev (continuing without blocking).'
          );
        }
      } catch (error) {
        if (!backfillAbortController.signal.aborted) {
          logger.warn(
            `⚠️  aggregateBackfill kickoff errored in dev: ${(error as Error).message}`
          );
        }
      }
    })();
  }

  if (backend === 'convex' && !convexDevArgs.includes('--once')) {
    const { watch } = await import('chokidar');
    const watchedEnv = watch(localConvexEnvPath, {
      ignoreInitial: true,
    }) as any;
    envWatcher = watchedEnv;
    watchedEnv
      .on('add', queueLocalEnvSync)
      .on('change', queueLocalEnvSync)
      .on('error', (error: unknown) => {
        if (!backfillAbortController.signal.aborted) {
          logger.warn(
            `⚠️  convex/.env watch error: ${(error as Error).message}`
          );
        }
      });
  }

  if (
    enableDevSchemaWatch &&
    devBackfillConfig.enabled !== 'off' &&
    fs.existsSync(schemaPath)
  ) {
    const { watch } = await import('chokidar');
    const watchedSchema = watch(schemaPath, {
      ignoreInitial: true,
    }) as any;
    schemaWatcher = watchedSchema;
    watchedSchema
      .on('change', () => {
        if (schemaDebounceTimer) {
          clearTimeout(schemaDebounceTimer);
        }
        schemaDebounceTimer = setTimeout(() => {
          queueSchemaBackfill();
        }, DEV_FILE_WATCH_DEBOUNCE_MS);
      })
      .on('error', (error: unknown) => {
        if (!backfillAbortController.signal.aborted) {
          logger.warn(
            `⚠️  schema watch error (aggregate backfill): ${(error as Error).message}`
          );
        }
      });
  }

  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    backfillAbortController.abort();
    if (envDebounceTimer) {
      clearTimeout(envDebounceTimer);
    }
    if (schemaDebounceTimer) {
      clearTimeout(schemaDebounceTimer);
    }
    void envWatcher?.close();
    void schemaWatcher?.close();
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    backfillAbortController.abort();
    if (envDebounceTimer) {
      clearTimeout(envDebounceTimer);
    }
    if (schemaDebounceTimer) {
      clearTimeout(schemaDebounceTimer);
    }
    void envWatcher?.close();
    void schemaWatcher?.close();
    cleanup();
    process.exit(0);
  });

  try {
    const result = await Promise.race([
      watcherProcess.then(
        (value) => ({
          source: 'watcher' as const,
          exitCode: value.exitCode ?? 0,
        }),
        () => ({ source: 'watcher' as const, exitCode: 1 })
      ),
      backendProcess.then(
        (value) => ({
          source: 'backend' as const,
          exitCode: value.exitCode ?? 0,
        }),
        () => ({ source: 'backend' as const, exitCode: 1 })
      ),
      authEnvSyncFailurePromise,
    ]);

    if (authEnvSyncPromise && convexDevArgs.includes('--once')) {
      await authEnvSyncPromise;
    }

    if (result.source === 'backend') {
      await backendReadyPromise;
    }

    return result.exitCode ?? 0;
  } finally {
    backfillAbortController.abort();
    if (envDebounceTimer) {
      clearTimeout(envDebounceTimer);
    }
    if (schemaDebounceTimer) {
      clearTimeout(schemaDebounceTimer);
    }
    await envWatcher?.close();
    await schemaWatcher?.close();
    cleanup();
  }
};
