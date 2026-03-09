import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ADD_HELP_TEXT, handleAddCommand } from './commands/add.js';
import { handleAggregateCommand } from './commands/aggregate.js';
import { handleAnalyzeCommand } from './commands/analyze.js';
import { handleCodegenCommand } from './commands/codegen.js';
import { handleDeployCommand } from './commands/deploy.js';
import { handleDevCommand } from './commands/dev.js';
import { DOCS_HELP_TEXT, handleDocsCommand } from './commands/docs.js';
import { handleEnvCommand } from './commands/env.js';
import { handleInfoCommand, INFO_HELP_TEXT } from './commands/info.js';
import { handleInitCommand, INIT_HELP_TEXT } from './commands/init.js';
import { handleMigrateCommand, MIGRATE_HELP_TEXT } from './commands/migrate.js';
import { handleResetCommand } from './commands/reset.js';
import { handleViewCommand, VIEW_HELP_TEXT } from './commands/view.js';
import type { BetterConvexBackend } from './config.js';
import {
  cleanup,
  getRootHelpText,
  isEntryPoint,
  parseArgs,
  type RunDeps,
  resolveConfiguredBackend,
  resolveRunDeps,
} from './core.js';
import { handleCliError } from './utils/handle-error.js';
import { logger } from './utils/logger.js';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json') as { version?: string };
const __filename = fileURLToPath(import.meta.url);
const HELP_FLAGS = new Set(['--help', '-h']);
const VERSION_FLAGS = new Set(['--version', '-v']);

export {
  collectPluginScaffoldTemplates,
  ensureConvexGitignoreEntry,
  getAggregateBackfillDeploymentKey,
  getDevAggregateBackfillStatePath,
  isEntryPoint,
  parseArgs,
} from './core.js';

const COMMAND_HELP: Record<string, string> = {
  init: INIT_HELP_TEXT,
  create: INIT_HELP_TEXT,
  add: ADD_HELP_TEXT,
  view: VIEW_HELP_TEXT,
  info: INFO_HELP_TEXT,
  docs: DOCS_HELP_TEXT,
  migrate: MIGRATE_HELP_TEXT,
};

const COMMAND_HANDLERS = {
  init: handleInitCommand,
  create: handleInitCommand,
  add: handleAddCommand,
  view: handleViewCommand,
  info: handleInfoCommand,
  docs: handleDocsCommand,
  codegen: handleCodegenCommand,
  env: handleEnvCommand,
  deploy: handleDeployCommand,
  migrate: handleMigrateCommand,
  aggregate: handleAggregateCommand,
  reset: handleResetCommand,
  dev: handleDevCommand,
  analyze: handleAnalyzeCommand,
} as const;

const printRootHelp = (backend: BetterConvexBackend = 'convex') => {
  logger.write(getRootHelpText(backend));
};

const printVersion = () => {
  logger.write(packageJson.version ?? '0.0.0');
};

const printCommandHelp = (
  command: string,
  backend: BetterConvexBackend = 'convex'
) => {
  const help = COMMAND_HELP[command];
  if (help) {
    logger.write(help);
    return;
  }
  printRootHelp(backend);
};

export async function run(argv: string[], deps: Partial<RunDeps> = {}) {
  if (argv.length === 0) {
    return handleDevCommand(argv, deps);
  }
  if (VERSION_FLAGS.has(argv[0]!)) {
    printVersion();
    return 0;
  }

  const parsed = parseArgs(argv);
  let resolvedBackend: BetterConvexBackend | undefined;
  const getBackend = () => {
    resolvedBackend ??= resolveConfiguredBackend({
      backendArg: parsed.backend,
      config: resolveRunDeps(deps).loadBetterConvexConfig(parsed.configPath),
    });
    return resolvedBackend;
  };
  if (
    HELP_FLAGS.has(argv[0]!) ||
    parsed.command === '--help' ||
    parsed.command === '-h'
  ) {
    printRootHelp(getBackend());
    return 0;
  }
  if (argv[0] === 'help') {
    printCommandHelp(argv[1] ?? '', getBackend());
    return 0;
  }
  if (
    parsed.command in COMMAND_HELP &&
    HELP_FLAGS.has(parsed.restArgs[0] ?? '')
  ) {
    printCommandHelp(parsed.command, getBackend());
    return 0;
  }

  const handler =
    COMMAND_HANDLERS[parsed.command as keyof typeof COMMAND_HANDLERS] ??
    handleDevCommand;
  return handler(argv, deps);
}

const isMain = isEntryPoint(process.argv[1], __filename);

if (isMain) {
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => process.exit(handleCliError(error, { cleanup }))
  );
}
