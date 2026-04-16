import fs from 'node:fs';
import path from 'node:path';
import {
  extractBackendRunTargetArgs,
  getAggregateBackfillDeploymentKey,
  parseArgs,
  type RunDeps,
  resolveConfiguredBackend,
  resolveRunDeps,
} from '../backend-core.js';
import { logger } from '../utils/logger.js';
import { handleDevCommand } from './dev.js';

const HELP_FLAGS = new Set(['--help', '-h']);

export const VERIFY_HELP_TEXT = `Usage: kitcn verify [options]

Run a local runtime proof through the kitcn dev pipeline.

Options:
  --api <dir>             Output directory (default from config)
  --backend <convex>      Backend CLI to drive
  --config <path>         Config path override
  --env-file <path>       Local deployment env file passthrough`;

function assertNoVerifyLifecycleFlags(args: string[]) {
  if (args.includes('--once') || args.includes('--bootstrap')) {
    throw new Error(
      '`kitcn verify` already runs one-shot runtime proof. Do not pass `--once` or `--bootstrap`.'
    );
  }
}

function hasConfiguredLocalConvexDeployment(cwd = process.cwd()) {
  return fs.existsSync(
    path.join(cwd, '.convex', 'local', 'default', 'config.json')
  );
}

async function withIsolatedLocalConvexState<T>(
  run: () => Promise<T>,
  cwd = process.cwd()
) {
  const statePath = path.join(cwd, '.convex');
  const hadExistingState = fs.existsSync(statePath);
  const backupPath = hadExistingState
    ? path.join(
        cwd,
        `.convex.verify.backup-${process.pid}-${Date.now().toString(36)}`
      )
    : null;

  if (backupPath) {
    fs.renameSync(statePath, backupPath);
  }

  try {
    return await run();
  } finally {
    fs.rmSync(statePath, { recursive: true, force: true });
    if (backupPath) {
      fs.renameSync(backupPath, statePath);
    }
  }
}

function buildVerifyDevArgv(argv: string[]): string[] {
  const parsed = parseArgs(argv);
  const commandIndex = argv.indexOf(parsed.command);
  const prefix = commandIndex >= 0 ? argv.slice(0, commandIndex) : [];
  return [...prefix, 'dev', '--once', ...parsed.restArgs];
}

export const handleVerifyCommand = async (
  argv: string[],
  deps?: Partial<RunDeps>
) => {
  const parsed = parseArgs(argv);
  if (
    HELP_FLAGS.has(argv[0] ?? '') ||
    HELP_FLAGS.has(parsed.restArgs[0] ?? '')
  ) {
    logger.write(VERIFY_HELP_TEXT);
    return 0;
  }

  assertNoVerifyLifecycleFlags(parsed.restArgs);

  const { loadCliConfig } = resolveRunDeps(deps);
  const config = loadCliConfig(parsed.configPath);
  const backend = resolveConfiguredBackend({
    backendArg: parsed.backend,
    config,
  });

  if (backend !== 'convex') {
    throw new Error('`kitcn verify` is only supported for backend convex.');
  }

  const targetArgs = extractBackendRunTargetArgs(backend, parsed.convexArgs);
  if (getAggregateBackfillDeploymentKey(targetArgs) !== 'local') {
    throw new Error(
      '`kitcn verify` is local-only. Remove remote deployment flags like `--prod`, `--preview-name`, and `--deployment-name`.'
    );
  }

  const devArgv = buildVerifyDevArgv(argv);
  if (hasConfiguredLocalConvexDeployment()) {
    return handleDevCommand(devArgv, deps);
  }

  return withIsolatedLocalConvexState(() => handleDevCommand(devArgv, deps));
};
