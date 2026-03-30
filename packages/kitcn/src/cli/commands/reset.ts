import {
  createBackendAdapter,
  extractBackendRunTargetArgs,
  extractResetCliOptions,
  parseArgs,
  type RunDeps,
  resolveConfiguredBackend,
  resolveRunDeps,
  runAggregateBackfillFlow,
  runBackendFunction,
} from '../backend-core.js';

export const handleResetCommand = async (
  argv: string[],
  deps: Partial<RunDeps> = {}
) => {
  const parsed = parseArgs(argv);
  const {
    execa: execaFn,
    loadCliConfig: loadCliConfigFn,
    realConvex: realConvexPath,
    realConcave: realConcavePath,
  } = resolveRunDeps(deps);
  const {
    confirmed,
    beforeHook,
    afterHook,
    remainingArgs: resetCommandArgs,
  } = extractResetCliOptions(parsed.convexArgs);
  if (!confirmed) {
    throw new Error('`kitcn reset` is destructive. Re-run with `--yes`.');
  }

  const config = loadCliConfigFn(parsed.configPath);
  const backend = resolveConfiguredBackend({
    backendArg: parsed.backend,
    config,
  });
  const backendAdapter = createBackendAdapter({
    backend,
    realConvexPath,
    realConcavePath,
  });
  const resetArgs = [...config.deploy.args, ...resetCommandArgs];
  const targetArgs = extractBackendRunTargetArgs(backend, resetArgs);

  const runOptionalHook = async (functionName: string | undefined) => {
    if (!functionName) {
      return 0;
    }
    const result = await runBackendFunction(
      execaFn,
      backendAdapter,
      functionName,
      {},
      targetArgs
    );
    return result.exitCode;
  };

  const beforeExitCode = await runOptionalHook(beforeHook);
  if (beforeExitCode !== 0) {
    return beforeExitCode;
  }

  const resetResult = await runBackendFunction(
    execaFn,
    backendAdapter,
    'generated/server:reset',
    {},
    targetArgs
  );
  if (resetResult.exitCode !== 0) {
    return resetResult.exitCode;
  }

  const backfillExitCode = await runAggregateBackfillFlow({
    execaFn,
    backendAdapter,
    backfillConfig: {
      enabled: 'on',
      wait: true,
      batchSize: 1000,
      pollIntervalMs: 1000,
      timeoutMs: 900_000,
      strict: false,
    },
    mode: 'resume',
    targetArgs,
    context: 'aggregate',
  });
  if (backfillExitCode !== 0) {
    return backfillExitCode;
  }

  return runOptionalHook(afterHook);
};
