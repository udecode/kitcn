import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cleanup,
  createBackendAdapter,
  createBackendCommandEnv,
  isEntryPoint,
  parseArgs,
  type RunDeps,
  resolveConfiguredBackend,
  resolveRunDeps,
} from './backend-core.js';
import { ADD_HELP_TEXT, handleAddCommand } from './commands/add.js';
import { handleAggregateCommand } from './commands/aggregate.js';
import { handleAnalyzeCommand } from './commands/analyze.js';
import { CODEGEN_HELP_TEXT, handleCodegenCommand } from './commands/codegen.js';
import { handleDeployCommand } from './commands/deploy.js';
import { DEV_HELP_TEXT, handleDevCommand } from './commands/dev.js';
import { DOCS_HELP_TEXT, handleDocsCommand } from './commands/docs.js';
import { ENV_HELP_TEXT, handleEnvCommand } from './commands/env.js';
import { handleInfoCommand, INFO_HELP_TEXT } from './commands/info.js';
import { handleInitCommand, INIT_HELP_TEXT } from './commands/init.js';
import { handleMigrateCommand, MIGRATE_HELP_TEXT } from './commands/migrate.js';
import { handleResetCommand } from './commands/reset.js';
import { handleViewCommand, VIEW_HELP_TEXT } from './commands/view.js';
import type { BetterConvexBackend } from './config.js';
import { handleCliError } from './utils/handle-error.js';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const HELP_FLAGS = new Set(['--help', '-h']);
const VERSION_FLAGS = new Set(['--version', '-v']);
const packageJson = readOwnPackageJson(import.meta.url);
const REMOVED_CREATE_MESSAGE =
  'Removed `better-convex create`. Use `better-convex init -t <next|vite>` for fresh app scaffolding.';

export {
  ensureConvexGitignoreEntry,
  getAggregateBackfillDeploymentKey,
  getDevAggregateBackfillStatePath,
  isEntryPoint,
  parseArgs,
} from './backend-core.js';
export { collectPluginScaffoldTemplates } from './registry/selection.js';

const COMMAND_HELP: Record<string, string> = {
  init: INIT_HELP_TEXT,
  add: ADD_HELP_TEXT,
  view: VIEW_HELP_TEXT,
  info: INFO_HELP_TEXT,
  docs: DOCS_HELP_TEXT,
  dev: DEV_HELP_TEXT,
  codegen: CODEGEN_HELP_TEXT,
  env: ENV_HELP_TEXT,
  migrate: MIGRATE_HELP_TEXT,
};

const COMMAND_HANDLERS = {
  init: handleInitCommand,
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

const CONCAVE_PASSTHROUGH_COMMANDS = [
  'run',
  'data',
  'function-spec',
  'components',
  'build',
  'dev',
  'deploy',
  'codegen',
  'init',
] as const;

export const getRootHelpText = (backend: BetterConvexBackend = 'convex') => {
  const backendPassThrough =
    backend === 'concave'
      ? [
          '',
          'Concave passthrough:',
          `  ${CONCAVE_PASSTHROUGH_COMMANDS.join(', ')}`,
          '  `better-convex env` is Convex-only.',
        ].join('\n')
      : [
          '',
          'Convex passthrough:',
          '  Unknown commands are forwarded to the Convex CLI.',
        ].join('\n');

  return `Usage: better-convex <command> [options]

Global options:
  --backend <convex|concave>   Backend CLI to drive

Commands:
  init                         Bootstrap Better Convex into a new or existing supported app
  dev                          Run dev workflow with codegen/watch passthrough
  codegen                      Generate Better Convex outputs
  add [plugin]                 Add a plugin scaffold + schema registration
  view [plugin]                Inspect a plugin install plan without writing
  info                         Inspect project + installed plugin state
  docs <topic...>              Show docs links for CLI and plugins
  env                          Manage Convex environment variables
  deploy                       Deploy with migrations/backfill flows
  migrate                      Migration lifecycle commands
  aggregate                    Aggregate backfill/rebuild/prune commands
  analyze                      Analyze runtime bundle
  reset                        Destructive database reset (requires --yes)
${backendPassThrough}

Run "better-convex <command> --help" for command options.`;
};

const printRootHelp = (backend: BetterConvexBackend = 'convex') => {
  logger.write(getRootHelpText(backend));
};

const printVersion = () => {
  logger.write(packageJson.version ?? '0.0.0');
};

export function resolveOwnPackageJsonPath(importMetaUrl: string) {
  let current = path.dirname(fileURLToPath(importMetaUrl));

  while (true) {
    const candidate = path.join(current, 'package.json');
    if (fs.existsSync(candidate)) {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as {
        name?: string;
      };
      if (parsed.name === 'better-convex') {
        return candidate;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(
        `Could not find better-convex package.json from ${importMetaUrl}.`
      );
    }
    current = parent;
  }
}

function readOwnPackageJson(importMetaUrl: string) {
  return JSON.parse(
    fs.readFileSync(resolveOwnPackageJsonPath(importMetaUrl), 'utf8')
  ) as { version?: string };
}

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

const handlePassthroughCommand = async (
  argv: string[],
  deps?: Partial<RunDeps>
) => {
  const parsed = parseArgs(argv);
  const {
    execa: execaFn,
    loadBetterConvexConfig,
    realConvex,
    realConcave,
  } = resolveRunDeps(deps);
  const config = loadBetterConvexConfig(parsed.configPath);
  const backend = resolveConfiguredBackend({
    backendArg: parsed.backend,
    config,
  });
  const backendAdapter = createBackendAdapter({
    backend,
    realConvexPath: realConvex,
    realConcavePath: realConcave,
  });
  const result = await execaFn(
    backendAdapter.command,
    [...backendAdapter.argsPrefix, parsed.command, ...parsed.convexArgs],
    {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: createBackendCommandEnv(),
      reject: false,
    }
  );
  return result.exitCode ?? 0;
};

export async function run(argv: string[], deps?: Partial<RunDeps>) {
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
    if (argv[1] === 'create') {
      throw new Error(REMOVED_CREATE_MESSAGE);
    }
    printCommandHelp(argv[1] ?? '', getBackend());
    return 0;
  }
  if (parsed.command === 'create') {
    throw new Error(REMOVED_CREATE_MESSAGE);
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
    handlePassthroughCommand;
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
