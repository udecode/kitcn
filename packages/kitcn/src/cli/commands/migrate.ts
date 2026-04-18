import {
  createBackendAdapter,
  extractBackendRunTargetArgs,
  extractMigrationCliOptions,
  extractMigrationDownOptions,
  getConvexDeploymentCommandEnv,
  parseArgs,
  type RunDeps,
  resolveConfiguredBackend,
  resolveMigrationConfig,
  resolveRunDeps,
  runBackendFunction,
  runMigrationCreate,
  runMigrationFlow,
} from '../backend-core.js';
import { logger } from '../utils/logger.js';

const HELP_FLAGS = new Set(['--help', '-h']);
const VALID_SUBCOMMANDS = new Set(['create', 'up', 'down', 'status', 'cancel']);

export const MIGRATE_HELP_TEXT = `Usage: kitcn migrate <command> [options]

Commands:
  create <name>     Create a migration file + manifest entry
  up                Apply pending migrations
  down              Roll back migrations
  status            Print runtime migration status
  cancel            Cancel an active migration run

Options:
  --list            List migrate subcommands
  --yes, -y         Reserved for non-interactive parity`;

export const parseMigrateCommandArgs = (args: string[]) => {
  let list = false;
  let yes = false;
  const positional: string[] = [];

  for (const arg of args) {
    if (arg === '--list' || arg === '-l') {
      list = true;
      continue;
    }
    if (arg === '--yes' || arg === '-y') {
      yes = true;
      continue;
    }
    positional.push(arg);
  }

  const [subcommand, ...restArgs] = positional;
  return {
    subcommand,
    restArgs,
    list,
    yes,
  };
};

const printMigrationList = () => {
  logger.write(
    [
      'Available migrate commands:',
      '  - create: scaffold a migration file and manifest entry',
      '  - up: apply pending migrations',
      '  - down: roll back applied migrations',
      '  - status: print runtime status',
      '  - cancel: cancel an active run',
    ].join('\n')
  );
};

export const handleMigrateCommand = async (
  argv: string[],
  deps: Partial<RunDeps> = {}
) => {
  const parsed = parseArgs(argv);
  if (
    HELP_FLAGS.has(argv[0] ?? '') ||
    HELP_FLAGS.has(parsed.restArgs[0] ?? '')
  ) {
    logger.write(MIGRATE_HELP_TEXT);
    return 0;
  }

  const migrateArgs = parseMigrateCommandArgs(parsed.restArgs);
  if (migrateArgs.list || !migrateArgs.subcommand) {
    printMigrationList();
    return 0;
  }
  if (!VALID_SUBCOMMANDS.has(migrateArgs.subcommand)) {
    throw new Error(
      'Unknown migrate command. Use: `kitcn migrate create|up|down|status|cancel`.'
    );
  }

  const {
    execa: execaFn,
    getConvexConfig: getConvexConfigFn,
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

  if (migrateArgs.subcommand === 'create') {
    const rawName = migrateArgs.restArgs.join(' ').trim();
    if (!rawName) {
      throw new Error(
        'Missing migration name. Usage: `kitcn migrate create <name>`.'
      );
    }
    const sharedDir = parsed.sharedDir ?? config.paths.shared;
    const { functionsDir } = getConvexConfigFn(sharedDir);
    await runMigrationCreate({
      migrationName: rawName,
      functionsDir,
    });
    return 0;
  }

  const { remainingArgs: migrationCommandArgs, overrides: migrationOverrides } =
    extractMigrationCliOptions(migrateArgs.restArgs);
  const migrationConfig = {
    ...resolveMigrationConfig(config.deploy.migrations, migrationOverrides),
    enabled: 'on' as const,
  };
  const commandArgs = [...config.deploy.args, ...migrationCommandArgs];
  const targetArgs = extractBackendRunTargetArgs(backend, commandArgs);

  if (migrateArgs.subcommand === 'up') {
    return runMigrationFlow({
      execaFn,
      backendAdapter,
      migrationConfig,
      targetArgs,
      env: commandEnv,
      context: 'migration',
      direction: 'up',
    });
  }

  if (migrateArgs.subcommand === 'down') {
    const { remainingArgs, steps, to } =
      extractMigrationDownOptions(commandArgs);
    const downTargetArgs = extractBackendRunTargetArgs(backend, remainingArgs);
    return runMigrationFlow({
      execaFn,
      backendAdapter,
      migrationConfig,
      targetArgs: downTargetArgs,
      env: commandEnv,
      context: 'migration',
      direction: 'down',
      steps,
      to,
    });
  }

  if (migrateArgs.subcommand === 'status') {
    const statusResult = await runBackendFunction(
      execaFn,
      backendAdapter,
      'generated/server:migrationStatus',
      {},
      targetArgs,
      {
        env: commandEnv,
      }
    );
    return statusResult.exitCode;
  }

  let runId: string | undefined;
  const cancelArgs: string[] = [];
  for (let index = 0; index < commandArgs.length; index += 1) {
    const arg = commandArgs[index];
    if (arg === '--run-id') {
      const value = commandArgs[index + 1];
      if (!value) {
        throw new Error('Missing value for --run-id.');
      }
      runId = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--run-id=')) {
      const value = arg.slice('--run-id='.length);
      if (!value) {
        throw new Error('Missing value for --run-id.');
      }
      runId = value;
      continue;
    }
    cancelArgs.push(arg);
  }
  const cancelTargetArgs = extractBackendRunTargetArgs(backend, cancelArgs);
  const cancelResult = await runBackendFunction(
    execaFn,
    backendAdapter,
    'generated/server:migrationCancel',
    runId ? { runId } : {},
    cancelTargetArgs,
    {
      env: commandEnv,
    }
  );
  return cancelResult.exitCode;
};
