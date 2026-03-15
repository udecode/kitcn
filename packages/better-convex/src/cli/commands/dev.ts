import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertNoRemovedDevPreRunFlag,
  cleanup,
  createBackendAdapter,
  createBackendCommandEnv,
  createCommandEnv,
  extractBackendRunTargetArgs,
  extractBackfillCliOptions,
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

export const handleDevCommand = async (
  argv: string[],
  deps?: Partial<RunDeps>
) => {
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
  const targetArgs = extractBackendRunTargetArgs(backend, convexDevArgs);
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

  const isTs = __filename.endsWith('.ts');
  const watcherPath = isTs
    ? join(__dirname, '..', 'watcher.ts')
    : join(__dirname, '..', 'watcher.mjs');
  const runtime = isTs ? 'bun' : process.execPath;

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

  const backendProcess = execaFn(
    backendAdapter.command,
    [...backendAdapter.argsPrefix, 'dev', ...convexDevArgs],
    {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: createBackendCommandEnv(),
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
        const exitCode = await runMigrationFlow({
          execaFn,
          backendAdapter,
          migrationConfig: devMigrationConfig,
          targetArgs,
          signal: backfillAbortController.signal,
          context: 'dev',
          direction: 'up',
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
        const exitCode = await runAggregateBackfillFlow({
          execaFn,
          backendAdapter,
          backfillConfig: devBackfillConfig,
          mode: 'resume',
          targetArgs,
          signal: backfillAbortController.signal,
          context: 'dev',
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
