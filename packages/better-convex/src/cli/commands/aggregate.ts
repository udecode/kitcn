import {
  createBackendAdapter,
  extractBackendRunTargetArgs,
  extractBackfillCliOptions,
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
      'Unknown aggregate command. Use: `better-convex aggregate backfill`, `better-convex aggregate rebuild`, or `better-convex aggregate prune`.'
    );
  }

  const {
    execa: execaFn,
    loadBetterConvexConfig: loadBetterConvexConfigFn,
    realConvex: realConvexPath,
    realConcave: realConcavePath,
  } = resolveRunDeps(deps);
  const config = loadBetterConvexConfigFn(parsed.configPath);
  const backend = resolveConfiguredBackend({
    backendArg: parsed.backend,
    config,
  });
  const backendAdapter = createBackendAdapter({
    backend,
    realConvexPath,
    realConcavePath,
  });
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
    });
  }

  return runAggregateBackfillFlow({
    execaFn,
    backendAdapter,
    backfillConfig,
    mode: subcommand === 'rebuild' ? 'rebuild' : 'resume',
    targetArgs,
    context: 'aggregate',
  });
};
