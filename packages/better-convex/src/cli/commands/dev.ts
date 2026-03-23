import fs from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
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
  runConvexDevPreRun,
  runConvexInitIfNeeded,
  runDevSchemaBackfillIfNeeded,
  runMigrationFlow,
  trackProcess,
} from '../backend-core.js';
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

type LocalSiteProxyHandle = {
  killed: boolean;
  kill: (signal?: string) => void;
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
  startLocalSiteProxy?: (
    options: LocalSiteProxyOptions
  ) => Promise<LocalSiteProxyHandle>;
};

type DevStartupRetryLogger = Pick<typeof logger, 'info'>;

type RunDevStartupRetryLoopParams = {
  backend: 'convex' | 'concave';
  label: string;
  runTask: () => Promise<number>;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  logger?: DevStartupRetryLogger;
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

export function resolveDevStartupRetryDelayMs(retryAttempt: number): number {
  return Math.min(
    1000 * 2 ** Math.max(0, retryAttempt - 1),
    DEV_STARTUP_RETRY_DELAY_CAP_MS
  );
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
    runtime: isTs ? 'bun' : process.execPath,
    watcherPath: isTs
      ? join(currentDir, '..', 'watcher.ts')
      : join(currentDir, 'watcher.mjs'),
  };
};

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
    backendArgs: [...args, '--port', String(LOCAL_CONCAVE_DEV_PORT)],
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
  const convexDevArgs = [...config.dev.args, ...devCommandArgs];
  const preRunFunction = config.dev.preRun;
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
  const backendDevArgs = concaveLocalDevContract?.backendArgs ?? convexDevArgs;
  const targetArgs =
    concaveLocalDevContract?.targetArgs ??
    extractBackendRunTargetArgs(backend, convexDevArgs);
  const trimSegments = resolveCodegenTrimSegments(config);

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
  if (backend === 'convex' && fs.existsSync(localConvexEnvPath)) {
    await syncEnvFn({
      force: true,
      targetArgs,
    });
  }

  if (preRunFunction) {
    const exitCode = await runConvexDevPreRun({
      execaFn,
      backendAdapter,
      functionName: preRunFunction,
      args: convexDevArgs,
    });
    if (exitCode !== 0) {
      return exitCode;
    }
  }

  await generateMetaFn(sharedDir, {
    debug,
    scope: 'all',
    trimSegments,
  });

  const { runtime, watcherPath } = resolveWatcherCommand();

  const watcherProcess = execaFn(runtime, [watcherPath], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: {
      ...createCommandEnv(),
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
      stdio: 'inherit',
      cwd: process.cwd(),
      env: createBackendCommandEnv(concaveLocalDevContract?.backendEnv),
      reject: false,
    }
  );
  trackProcess(backendProcess);

  const backfillAbortController = new AbortController();
  let schemaWatcher: {
    close: () => Promise<void> | void;
    on: (...args: any[]) => any;
  } | null = null;
  let schemaDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let schemaBackfillInFlight: Promise<void> | null = null;
  let schemaBackfillQueued = false;

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

  if (devMigrationConfig.enabled !== 'off') {
    void (async () => {
      try {
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
        }, 200);
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
    if (schemaDebounceTimer) {
      clearTimeout(schemaDebounceTimer);
    }
    void schemaWatcher?.close();
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    backfillAbortController.abort();
    if (schemaDebounceTimer) {
      clearTimeout(schemaDebounceTimer);
    }
    void schemaWatcher?.close();
    cleanup();
    process.exit(0);
  });

  const result = await Promise.race([
    watcherProcess.catch(() => ({ exitCode: 1 })),
    backendProcess,
  ]);
  backfillAbortController.abort();
  if (schemaDebounceTimer) {
    clearTimeout(schemaDebounceTimer);
  }
  await schemaWatcher?.close();
  cleanup();
  return result.exitCode ?? 0;
};
