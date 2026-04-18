import {
  createBackendAdapter,
  extractBackendRunTargetArgs,
  extractBackfillCliOptions,
  getConvexDeploymentCommandEnv,
  parseArgs,
  type RunDeps,
  resolveBackfillConfig,
  resolveConfiguredBackend,
  resolveRunDeps,
  runAggregateBackfillFlow,
  runAggregatePruneFlow,
} from '../backend-core.js';

export const handleAggregateCommand = async (
  argv: string[],
  deps: Partial<RunDeps> = {}
) => {
  const parsed = parseArgs(argv);
  const subcommand = parsed.restArgs[0];
  if (
    subcommand !== 'rebuild' &&
    subcommand !== 'backfill' &&
    subcommand !== 'prune'
  ) {
    throw new Error(
      'Unknown aggregate command. Use: `kitcn aggregate backfill`, `kitcn aggregate rebuild`, or `kitcn aggregate prune`.'
    );
  }

  const {
    execa: execaFn,
    loadCliConfig: loadCliConfigFn,
    realConvex: realConvexPath,
    realConcave: realConcavePath,
  } = resolveRunDeps(deps);
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
  const commandEnv =
    backend === 'convex' ? getConvexDeploymentCommandEnv() : undefined;
  const {
    remainingArgs: aggregateCommandArgs,
    overrides: aggregateBackfillOverrides,
  } = extractBackfillCliOptions(parsed.restArgs.slice(1));
  const aggregateArgs = [...config.deploy.args, ...aggregateCommandArgs];
  const backfillConfig = {
    ...resolveBackfillConfig(
      config.deploy.aggregateBackfill,
      aggregateBackfillOverrides
    ),
    enabled: 'on' as const,
  };
  const targetArgs = extractBackendRunTargetArgs(backend, aggregateArgs);

  if (subcommand === 'prune') {
    return runAggregatePruneFlow({
      execaFn,
      backendAdapter,
      targetArgs,
      env: commandEnv,
    });
  }

  return runAggregateBackfillFlow({
    execaFn,
    backendAdapter,
    backfillConfig,
    mode: subcommand === 'rebuild' ? 'rebuild' : 'resume',
    targetArgs,
    env: commandEnv,
    context: 'aggregate',
  });
};
