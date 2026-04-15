import {
  createBackendAdapter,
  createBackendCommandEnv,
  extractBackendRunTargetArgs,
  extractBackfillCliOptions,
  extractMigrationCliOptions,
  getConvexDeploymentCommandEnv,
  parseArgs,
  type RunDeps,
  resolveBackfillConfig,
  resolveConfiguredBackend,
  resolveMigrationConfig,
  resolveRunDeps,
  runAggregateBackfillFlow,
  runMigrationFlow,
} from '../backend-core.js';

export const handleDeployCommand = async (
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
  const {
    remainingArgs: deployArgsWithoutMigrationFlags,
    overrides: deployMigrationOverrides,
  } = extractMigrationCliOptions(parsed.convexArgs);
  const {
    remainingArgs: deployCommandArgs,
    overrides: deployBackfillOverrides,
  } = extractBackfillCliOptions(deployArgsWithoutMigrationFlags);
  const deployArgs = [...config.deploy.args, ...deployCommandArgs];
  const deployCommandEnv =
    backend === 'convex' ? getConvexDeploymentCommandEnv() : undefined;
  const deployResult = await execaFn(
    backendAdapter.command,
    [...backendAdapter.argsPrefix, 'deploy', ...deployArgs],
    {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: createBackendCommandEnv(deployCommandEnv),
      reject: false,
    }
  );
  if ((deployResult.exitCode ?? 1) !== 0) {
    return deployResult.exitCode ?? 1;
  }

  const migrationConfig = resolveMigrationConfig(
    config.deploy.migrations,
    deployMigrationOverrides
  );
  const backfillConfig = resolveBackfillConfig(
    config.deploy.aggregateBackfill,
    deployBackfillOverrides
  );
  const targetArgs = extractBackendRunTargetArgs(backend, deployArgs);

  const migrationExitCode = await runMigrationFlow({
    execaFn,
    backendAdapter,
    migrationConfig,
    targetArgs,
    env: deployCommandEnv,
    context: 'deploy',
    direction: 'up',
  });
  if (migrationExitCode !== 0) {
    return migrationExitCode;
  }

  return runAggregateBackfillFlow({
    execaFn,
    backendAdapter,
    backfillConfig,
    mode: 'resume',
    targetArgs,
    env: deployCommandEnv,
    context: 'deploy',
  });
};
