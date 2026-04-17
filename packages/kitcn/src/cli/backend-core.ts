import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  multiselect as clackMultiselect,
  select as clackSelect,
  confirm,
  isCancel,
} from '@clack/prompts';
import { parse as parseDotEnv } from 'dotenv';
import { execa } from 'execa';
import { getTableConfig } from '../orm/introspection.js';
import { getSchemaRelations } from '../orm/schema.js';
import { runAnalyze } from './analyze.js';
import { generateMeta, getConvexConfig } from './codegen.js';
import {
  type AggregateBackfillConfig,
  type BackfillEnabled,
  type CliBackend,
  type CliConfig,
  loadCliConfig,
  type MigrationConfig,
} from './config.js';
import {
  normalizeConvexCommandResult,
  writeConvexCommandOutput,
} from './convex-command.js';
import { pullEnv, resolveAuthEnvState, syncEnv } from './env.js';
import {
  type NextAppScaffoldContext,
  type ProjectScaffoldContext,
  type ReactScaffoldContext,
  resolveProjectScaffoldContext,
} from './project-context.js';
import {
  applyPlanningDependencyInstall,
  applyPluginDependencyInstall,
  inspectPluginDependencyInstall,
} from './registry/dependencies.js';
import { resolvePluginDocTopic } from './registry/docs.js';
import {
  getPluginCatalogEntry,
  getSupportedPluginKeys,
  isSupportedPluginKey,
  type PluginCatalogEntry,
  type PluginEnvField,
  type SupportedPluginKey,
} from './registry/index.js';
import { INIT_CONVEX_CONFIG_TEMPLATE } from './registry/init/init-convex-config.template.js';
import { renderInitConvexTsconfigTemplate } from './registry/init/init-convex-tsconfig.template.js';
import { INIT_CRPC_TEMPLATE } from './registry/init/init-crpc.template.js';
import { INIT_HTTP_TEMPLATE } from './registry/init/init-http.template.js';
import { INIT_SCHEMA_TEMPLATE } from './registry/init/init-schema.template.js';
import { INIT_NEXT_CLIENT_CRPC_TEMPLATE } from './registry/init/next/init-next-client-crpc.template.js';
import { INIT_NEXT_CONVEX_PROVIDER_TEMPLATE } from './registry/init/next/init-next-convex-provider.template.js';
import { renderInitNextEnvLocalTemplate } from './registry/init/next/init-next-env-local.template.js';
import { renderInitNextMessagesTemplate } from './registry/init/next/init-next-messages.template.js';
import { INIT_NEXT_MESSAGES_PAGE_TEMPLATE } from './registry/init/next/init-next-messages-page.template.js';
import { renderInitNextPackageJsonTemplate } from './registry/init/next/init-next-package-json.template.js';
import { INIT_NEXT_PROVIDERS_TEMPLATE } from './registry/init/next/init-next-providers.template.js';
import { INIT_NEXT_QUERY_CLIENT_TEMPLATE } from './registry/init/next/init-next-query-client.template.js';
import { INIT_NEXT_RSC_TEMPLATE } from './registry/init/next/init-next-rsc.template.js';
import { INIT_NEXT_SCHEMA_TEMPLATE } from './registry/init/next/init-next-schema.template.js';
import { INIT_NEXT_SERVER_TEMPLATE } from './registry/init/next/init-next-server.template.js';
import { INIT_REACT_CLIENT_CRPC_TEMPLATE } from './registry/init/react/init-react-client-crpc.template.js';
import { INIT_REACT_CONVEX_PROVIDER_TEMPLATE } from './registry/init/react/init-react-convex-provider.template.js';
import { renderInitReactEnvLocalTemplate } from './registry/init/react/init-react-env-local.template.js';
import { renderInitReactPackageJsonTemplate } from './registry/init/react/init-react-package-json.template.js';
import { INIT_REACT_PROVIDERS_TEMPLATE } from './registry/init/react/init-react-providers.template.js';
import { INIT_START_CONVEX_PROVIDER_TEMPLATE } from './registry/init/start/init-start-convex-provider.template.js';
import { INIT_START_CRPC_TEMPLATE } from './registry/init/start/init-start-crpc.template.js';
import { INIT_START_MESSAGES_PAGE_TEMPLATE } from './registry/init/start/init-start-messages-page.template.js';
import { INIT_START_ROOT_TEMPLATE } from './registry/init/start/init-start-root.template.js';
import { INIT_START_ROUTER_TEMPLATE } from './registry/init/start/init-start-router.template.js';
import { AUTH_CONVEX_PROVIDER_TEMPLATE } from './registry/items/auth/auth-convex-provider.template.js';
import { renderAuthCrpcTemplate } from './registry/items/auth/auth-crpc.template.js';
import { AUTH_NEXT_SERVER_TEMPLATE } from './registry/items/auth/auth-next-server.template.js';
import { AUTH_REACT_CONVEX_PROVIDER_TEMPLATE } from './registry/items/auth/auth-react-convex-provider.template.js';
import { AUTH_START_CONVEX_PROVIDER_TEMPLATE } from './registry/items/auth/auth-start-convex-provider.template.js';
import {
  createPlanFile,
  getCrpcFilePath,
  getHttpFilePath,
  renderInitTemplateContent,
} from './registry/plan-helpers.js';
import {
  buildEnvBootstrapFiles,
  buildPluginInstallPlan,
  KITCN_CONFIG_TEMPLATE_ID,
  KITCN_ENV_HELPER_TEMPLATE_ID,
  LOCAL_CONVEX_ENV_TEMPLATE_ID,
  renderEnvHelperContent,
  renderLocalConvexEnvContent,
  resolveEnvBootstrapPlanFileDetails,
  resolvePluginScaffoldRoots,
  serializePluginInstallPlan,
} from './registry/planner.js';
import {
  collectPluginScaffoldTemplates,
  filterScaffoldTemplatePathMap,
  promptForPluginSelection,
  promptForScaffoldTemplateSelection,
  resolveAddTemplateDefaults,
  resolvePluginPreset,
  resolvePresetScaffoldTemplates,
  resolveTemplateSelectionSource,
  resolveTemplatesByIdOrThrow,
} from './registry/selection.js';
import {
  assertSchemaFileExists,
  collectInstalledPluginKeys,
  getPluginLockfilePath,
  getSchemaFilePath,
  readPluginLockfile,
  resolveSchemaInstalledPlugins,
} from './registry/state.js';
import {
  BASELINE_DEPENDENCY_INSTALL_SPECS,
  getPackageNameFromInstallSpec,
  INIT_TEMPLATE_DEPENDENCY_INSTALL_SPECS,
  resolveScaffoldInstallSpec,
} from './supported-dependencies.js';

export { resolveScaffoldInstallSpec } from './supported-dependencies.js';

import { isContentEquivalent } from './utils/content-compare.js';
import { CRPC_BUILDER_STUB_SOURCE } from './utils/crpc-builder-stub.js';
import {
  formatPlanDiff as formatPlanDiffOutput,
  formatPlanSummary as formatPlanSummaryOutput,
  formatPlanView as formatPlanViewOutput,
  formatPluginView as formatPluginViewOutput,
} from './utils/dry-run-formatter.js';
import { highlighter } from './utils/highlighter.js';
import { logger } from './utils/logger.js';
import { createProjectJiti } from './utils/project-jiti.js';
import { createSpinner } from './utils/spinner.js';
import { createTypeScriptProxy } from './utils/typescript-runtime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ts = createTypeScriptProxy();

// Resolve real convex CLI binary
// Can't use require.resolve('convex/bin/main.js') because it's not exported
// Use the path relative to the convex package
const require = createRequire(import.meta.url);
const convexPkg = require.resolve('convex/package.json');
const realConvex = join(dirname(convexPkg), 'bin/main.js');
const MISSING_BACKFILL_FUNCTION_RE =
  /could not find function|function .* was not found|unknown function/i;
const GITIGNORE_RUNTIME_ENTRIES = ['.convex/', '.concave/'] as const;
const TS_EXTENSION_RE = /\.ts$/;
const LEADING_SLASHES_RE = /^\/+/;
const AGGREGATE_STATE_RELATIVE_PATH = join(
  '.convex',
  'kitcn',
  'aggregate-backfill-state.json'
);
const AGGREGATE_STATE_VERSION = 1;
export const INIT_SHADCN_PACKAGE_SPEC = 'shadcn@4.3.0';
const INIT_LOCAL_BOOTSTRAP_TIMEOUT_MS = 30_000;
const LOCAL_BACKEND_NOT_RUNNING_RE = /Local backend isn't running/i;
const INIT_GENERATED_SERVER_STUB_TEMPLATE = `// @ts-nocheck
import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server';

export type QueryCtx = GenericQueryCtx<GenericDataModel>;
export type MutationCtx = GenericMutationCtx<GenericDataModel>;
export type ActionCtx = GenericActionCtx<GenericDataModel>;
export type GenericCtx = QueryCtx | MutationCtx | ActionCtx;

${CRPC_BUILDER_STUB_SOURCE}
`;
const INIT_LOCAL_BOOTSTRAP_READY_RE = /(Convex|Concave) functions ready!/i;
const CONVEX_INIT_CREATED_CONFIG_RE =
  /Configured a local deployment|Provisioned a .* deployment|saved its name as CONVEX_DEPLOYMENT/i;
const INIT_NEXT_IMPORT_QUOTE_RE = /from\s+(['"])/;
const INIT_NEXT_IMPORT_SEMICOLON_RE = /^\s*import .*;\s*$/m;
const INIT_NEXT_TRAILING_NEWLINES_RE = /\n*$/;
const INIT_NEXT_PROVIDERS_IMPORT_RE = /from ['"]@\/components\/providers['"]/;
const INIT_NEXT_CHILDREN_SLOT_RE = /\{\s*children\s*\}/g;

export type ParsedArgs = {
  command: string;
  restArgs: string[];
  convexArgs: string[];
  backend?: CliBackend;
  debug: boolean;
  sharedDir?: string;
  scope?: 'all' | 'auth' | 'orm';
  configPath?: string;
};

const VALID_SCOPES = new Set(['all', 'auth', 'orm']);
const VALID_BACKENDS = new Set<CliBackend>(['convex', 'concave']);
type SupportedPlugin = SupportedPluginKey;
const SUPPORTED_PLUGINS = new Set<SupportedPlugin>(getSupportedPluginKeys());
type CommonPluginCommandArgs = {
  plugin?: SupportedPlugin;
  yes: boolean;
  json: boolean;
  dryRun: boolean;
  noCodegen: boolean;
  preset?: string;
};
type AddCommandArgs = CommonPluginCommandArgs & {
  overwrite: boolean;
  diff?: string | true;
  view?: string | true;
};
type ViewCommandArgs = {
  plugin?: SupportedPlugin;
  json: boolean;
  preset?: string;
};
type InfoCommandArgs = {
  json: boolean;
};
type DocsCommandArgs = {
  json: boolean;
  topics: string[];
};
export type InitCommandArgs = {
  yes: boolean;
  json: boolean;
  defaults: boolean;
  overwrite: boolean;
  template?: string;
  cwd?: string;
  name?: string;
  targetArgs?: string[];
};
export type InitCodegenStatus = 'generated' | 'stubbed';
export type InitConvexBootstrapStatus = 'existing' | 'created' | 'missing';
export type InitRunResult = {
  backend: CliBackend;
  cwd: string;
  created: string[];
  updated: string[];
  skipped: string[];
  usedShadcn: boolean;
  template: string | null;
  codegen: InitCodegenStatus;
  convexBootstrap: InitConvexBootstrapStatus;
  localBootstrapUsed: boolean;
};

type PluginEnvReminder = {
  key: string;
  path: string;
  message?: string;
};

type PluginDescriptor = PluginCatalogEntry;
type PlanFileKind = 'config' | 'env' | 'schema' | 'lockfile' | 'scaffold';
type PlanFileAction = 'create' | 'update' | 'skip';
type PlanOperationKind =
  | 'dependency_install'
  | 'codegen'
  | 'post_add_hook'
  | 'env_reminder';
type PlanOperationStatus = 'pending' | 'skipped' | 'applied';

type PluginInstallPlanFile = {
  kind: PlanFileKind;
  templateId?: string;
  path: string;
  action: PlanFileAction;
  reason: string;
  content: string;
  existingContent?: string;
  managedBaselineContent?: string | readonly string[];
  requiresExplicitOverwrite?: boolean;
  manualActions?: string[];
  schemaOwnershipLock?: {
    path: string;
    tables: Record<
      string,
      | {
          owner: 'local';
        }
      | {
          checksum: string;
          owner: 'managed';
        }
    >;
  } | null;
};

type PluginInstallPlanOperation = {
  kind: PlanOperationKind;
  status: PlanOperationStatus;
  reason: string;
  path?: string;
  packageName?: string;
  command?: string;
  key?: string;
  message?: string;
};
type CodegenRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};
type InitBootstrapResult = CodegenRunResult & {
  stop: () => Promise<void>;
};
type PersistentExecaProcess = PromiseLike<{
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
}> & {
  stdout?: NodeJS.ReadableStream | null;
  stderr?: NodeJS.ReadableStream | null;
  kill?: (signal?: string) => boolean;
};

type InitOwnedTemplateScaffoldFile = {
  kind: PlanFileKind;
  relativePath: string;
  content: string | ((params: { existingContent?: string }) => string);
  preserveManagedContent?: string[];
  managedBaselineContent?: string | readonly string[];
  requiresExplicitOverwrite?: boolean;
  createReason: string;
  updateReason: string;
  skipReason: string;
};

type InitNextScaffoldContext = NextAppScaffoldContext;

type InstalledPluginState = {
  plugin: SupportedPlugin;
  packageName: string;
  schemaRegistered: boolean;
  lockfileRegistered: boolean;
  missingDependency: boolean;
  driftedFiles: number;
  clean: boolean;
  defaultPreset: string | null;
  docs: PluginCatalogEntry['docs'];
};

type CliDocEntry = {
  title: string;
  localPath: string;
  publicUrl?: string;
  keywords?: readonly string[];
};

type CliSelectOption<TValue extends string> = {
  value: TValue;
  label: string;
  hint?: string;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type PromptAdapter = {
  isInteractive: () => boolean;
  confirm: (message: string, defaultValue?: boolean) => Promise<boolean>;
  select: <TValue extends string>(params: {
    message: string;
    options: readonly CliSelectOption<TValue>[];
  }) => Promise<TValue | symbol>;
  multiselect: <TValue extends string>(params: {
    message: string;
    options: readonly CliSelectOption<TValue>[];
    initialValues?: readonly TValue[];
    required?: boolean;
  }) => Promise<TValue[] | symbol>;
};

const HELP_FLAGS = new Set(['--help', '-h']);

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

const ADD_HELP_TEXT = `Usage: kitcn add [plugin] [options]

Options:
  --yes, -y         Deterministic non-interactive mode
  --json            Machine-readable command output
  --dry-run         Show planned operations without writing files
  --diff [path]     Show unified diffs for planned file changes
  --view [path]     Show planned file contents
  --overwrite       Overwrite existing changed files without prompt
  --no-codegen      Skip automatic codegen after add
  --preset, -p      Plugin preset override`;

const VIEW_HELP_TEXT = `Usage: kitcn view [plugin] [options]

Options:
  --json            Machine-readable command output
  --preset, -p      Plugin preset override`;

const INFO_HELP_TEXT = `Usage: kitcn info [options]

Options:
  --json            Machine-readable project inspection output`;

const DOCS_HELP_TEXT = `Usage: kitcn docs <topic...> [options]

Options:
  --json            Machine-readable docs link output`;

const AUTH_HELP_TEXT = `Usage: kitcn auth jwks [options]

Commands:
  jwks                       Print a manual JWKS env payload from the auth runtime

Options:
  --rotate                   Rotate auth keys before fetching JWKS
  --json                     Machine-readable output`;

const CODEGEN_HELP_TEXT = `Usage: kitcn codegen [options]

Options:
  --api <dir>       Output directory (default from config)
  --scope <mode>    Generation scope: all | auth | orm
  --config <path>   Config path override
  --debug           Show detailed output`;

export const DEV_HELP_TEXT = `Usage: kitcn dev [options]

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

const INIT_HELP_TEXT = `Usage: kitcn init [options]

Options:
  --cwd             Target directory
  --yes, -y         Deterministic non-interactive mode
  --json            Machine-readable command output`;

const SUPPORTED_INIT_TEMPLATES = ['next', 'start', 'vite'] as const;
const REACT_APP_MOUNT_RE = /<App\s*\/>/;

const DOCS_BASE_URL = 'https://kitcn.vercel.app/docs';

const CORE_DOC_TOPICS: Record<string, CliDocEntry> = {
  cli: {
    title: 'CLI',
    localPath: 'www/content/docs/cli/index.mdx',
    publicUrl: `${DOCS_BASE_URL}/cli`,
    keywords: ['cli', 'commands', 'codegen'],
  },
  plugins: {
    title: 'Plugins',
    localPath: 'www/content/docs/plugins/index.mdx',
    publicUrl: `${DOCS_BASE_URL}/plugins`,
    keywords: ['plugins', 'registry'],
  },
  auth: {
    title: 'Auth',
    localPath: 'www/content/docs/auth/index.mdx',
    publicUrl: `${DOCS_BASE_URL}/auth`,
    keywords: ['auth', 'better-auth'],
  },
  orm: {
    title: 'ORM',
    localPath: 'www/content/docs/orm/index.mdx',
    publicUrl: `${DOCS_BASE_URL}/orm`,
    keywords: ['orm', 'schema', 'queries'],
  },
  migrations: {
    title: 'Migrations',
    localPath: 'www/content/docs/orm/migrations.mdx',
    publicUrl: `${DOCS_BASE_URL}/orm/migrations`,
    keywords: ['migrations', 'deploy'],
  },
};

// Parse args: kitcn [command] [--api <dir>] [--scope <all|auth|orm>] [--config <path>] [--debug] [...convex-args]
export function parseArgs(argv: string[]): ParsedArgs {
  let debug = false;
  let sharedDir: string | undefined;
  let scope: 'all' | 'auth' | 'orm' | undefined;
  let configPath: string | undefined;
  let backend: CliBackend | undefined;

  const filtered: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (a === '--debug') {
      debug = true;
      continue;
    }

    if (a === '--api') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --api.');
      }
      sharedDir = value;
      i += 1; // skip value
      continue;
    }

    if (a === '--scope') {
      const value = argv[i + 1];
      if (!value || !VALID_SCOPES.has(value)) {
        throw new Error(
          `Invalid --scope value "${value ?? ''}". Expected one of: all, auth, orm.`
        );
      }
      scope = value as 'all' | 'auth' | 'orm';
      i += 1; // skip value
      continue;
    }

    if (a === '--config') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --config.');
      }
      configPath = value;
      i += 1; // skip value
      continue;
    }

    if (a === '--backend') {
      const value = argv[i + 1];
      if (!value || !VALID_BACKENDS.has(value as CliBackend)) {
        throw new Error(
          `Invalid --backend value "${value ?? ''}". Expected one of: convex, concave.`
        );
      }
      backend = value as CliBackend;
      i += 1; // skip value
      continue;
    }

    filtered.push(a);
  }

  const command = filtered[0] || 'dev';
  const restArgs = filtered.slice(1);

  return {
    command,
    restArgs,
    convexArgs: restArgs,
    backend,
    debug,
    sharedDir,
    scope,
    configPath,
  };
}

function parsePluginPosition(args: string[]): {
  plugin?: SupportedPlugin;
  startIndex: number;
} {
  const first = args[0];
  if (!first || first.startsWith('-')) {
    return { startIndex: 0 };
  }
  if (!SUPPORTED_PLUGINS.has(first as SupportedPlugin)) {
    throw new Error(
      `Unsupported plugin "${first}". Supported plugins: ${[
        ...SUPPORTED_PLUGINS,
      ].join(', ')}.`
    );
  }
  return {
    plugin: first as SupportedPlugin,
    startIndex: 1,
  };
}

function hasHelpFlag(args: string[]): boolean {
  return args.some((arg) => HELP_FLAGS.has(arg));
}

export function getRootHelpText(backend: CliBackend = 'convex'): string {
  const backendPassThrough =
    backend === 'concave'
      ? [
          '',
          'Concave passthrough:',
          `  ${CONCAVE_PASSTHROUGH_COMMANDS.join(', ')}`,
          '  `kitcn env` is Convex-only.',
        ].join('\n')
      : [
          '',
          'Convex passthrough:',
          '  Unknown commands are forwarded to the Convex CLI.',
        ].join('\n');

  return `Usage: kitcn <command> [options]

Global options:
  --backend <convex|concave>   Backend CLI to drive

Commands:
  init                         Bootstrap kitcn into a new or existing supported app
  dev                          Run dev workflow with codegen/watch passthrough
  codegen                      Generate kitcn outputs
  add [plugin]                 Add a plugin scaffold + schema registration
  view [plugin]                Inspect a plugin install plan without writing
  info                         Inspect project + installed plugin state
  docs <topic...>              Show docs links for CLI and plugins
  auth                         Auth runtime helpers
  env                          Manage Convex environment variables
  deploy                       Deploy with migrations/backfill flows
  migrate                      Migration lifecycle commands
  aggregate                    Aggregate backfill/rebuild/prune commands
  analyze                      Analyze runtime bundle
  reset                        Destructive database reset (requires --yes)
${backendPassThrough}

Run "kitcn <command> --help" for command options.`;
}

function printRootHelp(backend: CliBackend = 'convex'): void {
  logger.write(getRootHelpText(backend));
}

function printCommandHelp(
  command: string,
  backend: CliBackend = 'convex'
): void {
  if (command === 'init') {
    logger.write(INIT_HELP_TEXT);
    return;
  }
  if (command === 'add') {
    logger.write(ADD_HELP_TEXT);
    return;
  }
  if (command === 'view') {
    logger.write(VIEW_HELP_TEXT);
    return;
  }
  if (command === 'info') {
    logger.write(INFO_HELP_TEXT);
    return;
  }
  if (command === 'docs') {
    logger.write(DOCS_HELP_TEXT);
    return;
  }
  if (command === 'auth') {
    logger.write(AUTH_HELP_TEXT);
    return;
  }
  if (command === 'codegen') {
    logger.write(CODEGEN_HELP_TEXT);
    return;
  }
  if (command === 'dev') {
    logger.write(DEV_HELP_TEXT);
    return;
  }
  printRootHelp(backend);
}

function isCiEnvironment(): boolean {
  const ci = process.env.CI;
  if (typeof ci !== 'string') {
    return false;
  }
  const normalized = ci.trim().toLowerCase();
  return normalized.length > 0 && normalized !== '0' && normalized !== 'false';
}

function createPromptAdapter(): PromptAdapter {
  return {
    isInteractive: () =>
      Boolean(
        process.stdin.isTTY && process.stdout.isTTY && !isCiEnvironment()
      ),
    confirm: async (message: string, defaultValue?: boolean) => {
      const response = await confirm({
        message,
        ...(defaultValue === undefined ? {} : { initialValue: defaultValue }),
      });
      if (isCancel(response)) {
        return false;
      }
      return Boolean(response);
    },
    select: async <TValue extends string>(params: {
      message: string;
      options: readonly CliSelectOption<TValue>[];
    }) => {
      const options = params.options.map((option) => {
        const next: {
          value: TValue;
          label: string;
          hint?: string;
        } = {
          value: option.value,
          label: option.label,
        };
        if (option.hint) {
          next.hint = option.hint;
        }
        return next;
      });
      return (await clackSelect<TValue>({
        message: params.message,
        options: options as any,
      })) as TValue | symbol;
    },
    multiselect: async <TValue extends string>(params: {
      message: string;
      options: readonly CliSelectOption<TValue>[];
      initialValues?: readonly TValue[];
      required?: boolean;
    }) => {
      const options = params.options.map((option) => {
        const next: {
          value: TValue;
          label: string;
          hint?: string;
        } = {
          value: option.value,
          label: option.label,
        };
        if (option.hint) {
          next.hint = option.hint;
        }
        return next;
      });
      return (await clackMultiselect<TValue>({
        message: params.message,
        options: options as any,
        initialValues: params.initialValues as TValue[] | undefined,
        required: params.required,
      })) as TValue[] | symbol;
    },
  };
}

export function resolveRunDeps(deps: Partial<RunDeps> = {}): RunDeps {
  return {
    execa,
    runAnalyze,
    generateMeta,
    getConvexConfig,
    pullEnv,
    syncEnv,
    loadCliConfig,
    ensureConvexGitignoreEntry,
    promptAdapter: createPromptAdapter(),
    enableDevSchemaWatch: true,
    realConvex,
    realConcave: undefined,
    ...deps,
  };
}

export function createCommandEnv(
  overrides?: Record<string, string | undefined>
): Record<string, string | undefined> {
  return {
    ...process.env,
    ...overrides,
  };
}

const CONVEX_DEPLOYMENT_ENV_KEYS = [
  'CONVEX_DEPLOYMENT',
  'CONVEX_DEPLOY_KEY',
  'CONVEX_SELF_HOSTED_URL',
  'CONVEX_SELF_HOSTED_ADMIN_KEY',
] as const;
const LOCAL_CONVEX_DEPLOYMENT_PREFIXES = ['local:', 'anonymous:'] as const;
const LOCAL_CONVEX_DEPLOYMENT_VALUES = ['anonymous-agent'] as const;

function isLocalConvexDeploymentValue(deployment: string | undefined): boolean {
  if (!deployment) {
    return false;
  }
  return (
    LOCAL_CONVEX_DEPLOYMENT_VALUES.includes(
      deployment as (typeof LOCAL_CONVEX_DEPLOYMENT_VALUES)[number]
    ) ||
    LOCAL_CONVEX_DEPLOYMENT_PREFIXES.some((prefix) =>
      deployment.startsWith(prefix)
    )
  );
}

export function createBackendCommandEnv(
  overrides?: Record<string, string | undefined>
): Record<string, string | undefined> {
  const clearedDeploymentEnv = Object.fromEntries(
    CONVEX_DEPLOYMENT_ENV_KEYS.map((key) => [key, undefined])
  ) as Record<string, string | undefined>;
  return {
    ...createCommandEnv(),
    ...clearedDeploymentEnv,
    ...overrides,
  };
}

export function getConvexDeploymentCommandEnv(
  env: Record<string, string | undefined> = process.env
): Record<string, string | undefined> {
  return Object.fromEntries(
    CONVEX_DEPLOYMENT_ENV_KEYS.map((key) => [key, env[key]])
  ) as Record<string, string | undefined>;
}

export function hasRemoteConvexDeploymentEnv(
  env: Record<string, string | undefined>
): boolean {
  const deployment = env.CONVEX_DEPLOYMENT?.trim();
  if (deployment && !isLocalConvexDeploymentValue(deployment)) {
    return true;
  }

  return Boolean(
    env.CONVEX_DEPLOY_KEY?.trim() ||
      env.CONVEX_SELF_HOSTED_URL?.trim() ||
      env.CONVEX_SELF_HOSTED_ADMIN_KEY?.trim()
  );
}

function readConvexTargetEnvFile(
  args: string[],
  cwd = process.cwd()
): Record<string, string> | null {
  const envFile = readOptionalCliFlagValue(args, '--env-file');
  if (!envFile) {
    return null;
  }

  const envFilePath = resolve(cwd, envFile);
  if (!fs.existsSync(envFilePath)) {
    return null;
  }

  return parseDotEnv(fs.readFileSync(envFilePath, 'utf8'));
}

function resolveRemoteConvexDeploymentKey(
  env: Record<string, string | undefined>
): string | null {
  if (!hasRemoteConvexDeploymentEnv(env)) {
    return null;
  }

  const deployment = env.CONVEX_DEPLOYMENT?.trim();
  if (deployment) {
    return `deployment-env:${deployment}`;
  }

  const selfHostedUrl = env.CONVEX_SELF_HOSTED_URL?.trim();
  if (selfHostedUrl) {
    return `self-hosted-env:${selfHostedUrl}`;
  }

  return 'remote-env';
}

function getLocalParseEnvVars(
  sharedDir: string | undefined,
  backend: CliBackend
): Record<string, string> {
  const { functionsDir } = getConvexConfig(sharedDir);
  const rootEnvPath = join(process.cwd(), '.env');
  const backendEnvPath = join(functionsDir, '..', '.env');
  const envPaths =
    backend === 'concave'
      ? [backendEnvPath, rootEnvPath]
      : [rootEnvPath, backendEnvPath];

  const mergedEnv: Record<string, string> = {};
  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) {
      continue;
    }
    Object.assign(mergedEnv, parseDotEnv(fs.readFileSync(envPath, 'utf8')));
  }

  return mergedEnv;
}

function getLocalBackendEnvVars(
  sharedDir: string | undefined,
  backend: CliBackend
): Record<string, string> {
  const { functionsDir } = getConvexConfig(sharedDir);
  const rootEnvPath = join(process.cwd(), '.env');
  const backendEnvPath = join(functionsDir, '..', '.env');
  const envPaths =
    backend === 'concave' ? [backendEnvPath, rootEnvPath] : [backendEnvPath];

  const mergedEnv: Record<string, string> = {};
  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) {
      continue;
    }
    Object.assign(mergedEnv, parseDotEnv(fs.readFileSync(envPath, 'utf8')));
  }

  return mergedEnv;
}

export async function withLocalCodegenEnv<T>(
  sharedDir: string | undefined,
  backend: CliBackend,
  fn: () => Promise<T>
): Promise<T> {
  const envVars = getLocalParseEnvVars(sharedDir, backend);
  if (Object.keys(envVars).length === 0) {
    return fn();
  }

  const previousValues = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(envVars)) {
    previousValues.set(key, process.env[key]);
    process.env[key] = value;
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previousValues.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function parseAddCommandArgs(args: string[]): AddCommandArgs {
  const { plugin, startIndex } = parsePluginPosition(args);

  let yes = false;
  let json = false;
  let dryRun = false;
  let overwrite = false;
  let noCodegen = false;
  let preset: string | undefined;
  let diff: string | true | undefined;
  let view: string | true | undefined;

  for (let i = startIndex; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--yes' || arg === '-y') {
      yes = true;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--diff') {
      const value = args[i + 1];
      if (value && !value.startsWith('-')) {
        diff = value;
        i += 1;
      } else {
        diff = true;
      }
      continue;
    }
    if (arg.startsWith('--diff=')) {
      const value = arg.slice('--diff='.length);
      diff = value.length > 0 ? value : true;
      continue;
    }
    if (arg === '--view') {
      const value = args[i + 1];
      if (value && !value.startsWith('-')) {
        view = value;
        i += 1;
      } else {
        view = true;
      }
      continue;
    }
    if (arg.startsWith('--view=')) {
      const value = arg.slice('--view='.length);
      view = value.length > 0 ? value : true;
      continue;
    }
    if (arg === '--overwrite') {
      overwrite = true;
      continue;
    }
    if (arg === '--no-codegen') {
      noCodegen = true;
      continue;
    }
    if (arg === '--preset' || arg === '-p') {
      const value = args[i + 1];
      if (!value) {
        throw new Error('Missing value for --preset.');
      }
      preset = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('--preset=')) {
      const value = arg.slice('--preset='.length);
      if (!value) {
        throw new Error('Missing value for --preset.');
      }
      preset = value;
      continue;
    }
    throw new Error(`Unknown add flag "${arg}".`);
  }

  return {
    plugin,
    yes,
    json,
    dryRun: dryRun || Boolean(diff) || Boolean(view),
    overwrite,
    noCodegen,
    preset,
    diff,
    view,
  };
}

export function parseInitCommandArgs(args: string[]): InitCommandArgs {
  let yes = false;
  let json = false;
  let defaults = false;
  let overwrite = false;
  let template: string | undefined;
  let cwd: string | undefined;
  let name: string | undefined;
  const targetArgs: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--yes' || arg === '-y') {
      yes = true;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--defaults') {
      defaults = true;
      continue;
    }
    if (arg === '--overwrite') {
      overwrite = true;
      continue;
    }
    if (arg === '--template' || arg === '-t') {
      const value = args[i + 1];
      if (!value) {
        throw new Error('Missing value for --template.');
      }
      template = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('--template=')) {
      const value = arg.slice('--template='.length);
      if (!value) {
        throw new Error('Missing value for --template.');
      }
      template = value;
      continue;
    }
    if (arg === '--cwd') {
      const value = args[i + 1];
      if (!value) {
        throw new Error('Missing value for --cwd.');
      }
      cwd = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('--cwd=')) {
      const value = arg.slice('--cwd='.length);
      if (!value) {
        throw new Error('Missing value for --cwd.');
      }
      cwd = value;
      continue;
    }
    if (arg === '--name') {
      const value = args[i + 1];
      if (!value) {
        throw new Error('Missing value for --name.');
      }
      name = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('--name=')) {
      const value = arg.slice('--name='.length);
      if (!value) {
        throw new Error('Missing value for --name.');
      }
      name = value;
      continue;
    }
    if (
      arg === '--team' ||
      arg.startsWith('--team=') ||
      arg === '--project' ||
      arg.startsWith('--project=') ||
      arg === '--dev-deployment' ||
      arg.startsWith('--dev-deployment=')
    ) {
      throw new Error(
        'Removed `kitcn init` bootstrap flags. Use `convex init` for deployment setup.'
      );
    }
    if (arg === '--prod') {
      targetArgs.push(arg);
      continue;
    }
    if (
      arg === '--preview-name' ||
      arg === '--deployment-name' ||
      arg === '--env-file' ||
      arg === '--component'
    ) {
      const { value, nextIndex } = readFlagValue(args, i, arg);
      targetArgs.push(arg, value);
      i = nextIndex;
      continue;
    }
    if (
      arg.startsWith('--preview-name=') ||
      arg.startsWith('--deployment-name=') ||
      arg.startsWith('--env-file=') ||
      arg.startsWith('--component=')
    ) {
      targetArgs.push(arg);
      continue;
    }
    throw new Error(`Unknown init flag "${arg}".`);
  }

  return {
    yes,
    json,
    defaults,
    overwrite,
    template,
    cwd,
    name,
    targetArgs,
  };
}

function parseViewCommandArgs(args: string[]): ViewCommandArgs {
  const { plugin, startIndex } = parsePluginPosition(args);

  let json = false;
  let preset: string | undefined;

  for (let i = startIndex; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--preset' || arg === '-p') {
      const value = args[i + 1];
      if (!value) {
        throw new Error('Missing value for --preset.');
      }
      preset = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('--preset=')) {
      const value = arg.slice('--preset='.length);
      if (!value) {
        throw new Error('Missing value for --preset.');
      }
      preset = value;
      continue;
    }
    throw new Error(`Unknown view flag "${arg}".`);
  }

  return {
    plugin,
    json,
    preset,
  };
}

function parseInfoCommandArgs(args: string[]): InfoCommandArgs {
  let json = false;
  for (const arg of args) {
    if (arg === '--json') {
      json = true;
      continue;
    }
    throw new Error(`Unknown info flag "${arg}".`);
  }
  return { json };
}

function parseDocsCommandArgs(args: string[]): DocsCommandArgs {
  let json = false;
  const topics: string[] = [];
  for (const arg of args) {
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown docs flag "${arg}".`);
    }
    topics.push(arg);
  }
  if (topics.length === 0) {
    throw new Error('Missing docs topic. Usage: kitcn docs <topic...>.');
  }
  return { json, topics };
}

function getPluginDescriptor(plugin: SupportedPlugin): PluginDescriptor {
  return getPluginCatalogEntry(plugin);
}

function findNearestPackageJsonPath(startDir: string): string | undefined {
  let current = resolve(startDir);
  while (true) {
    const candidate = join(current, 'package.json');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return;
    }
    current = parent;
  }
}

export async function createProjectWithShadcn(params: {
  projectDir: string;
  template: string;
  yes: boolean;
  defaults: boolean;
  execaFn: typeof execa;
}): Promise<void> {
  const shouldStageIntoExistingDir =
    fs.existsSync(params.projectDir) &&
    fs.readdirSync(params.projectDir).length === 0;
  const stagingRoot = shouldStageIntoExistingDir
    ? fs.mkdtempSync(join(dirname(params.projectDir), '.kitcn-shadcn-'))
    : null;
  const shadcnCwd = stagingRoot ?? dirname(params.projectDir);
  const projectName = basename(params.projectDir);
  const useDefaults = params.defaults || params.yes;
  const command = detectPackageManager(shadcnCwd) === 'bun' ? 'bunx' : 'npx';
  const args = [
    INIT_SHADCN_PACKAGE_SPEC,
    'init',
    '--template',
    params.template,
    '--cwd',
    shadcnCwd,
    '--name',
    projectName,
    ...(useDefaults ? ['--defaults'] : []),
    ...(params.yes || params.defaults ? ['--yes'] : []),
  ];

  try {
    const result = await params.execaFn(command, args, {
      cwd: process.cwd(),
      env: createCommandEnv(),
      reject: false,
      stdio: 'inherit',
    });
    if ((result.exitCode ?? 0) !== 0) {
      throw new Error(`shadcn init failed: ${command} ${args.join(' ')}`);
    }

    if (stagingRoot) {
      moveStagedProjectIntoExistingDir({
        stagedProjectDir: join(stagingRoot, projectName),
        targetDir: params.projectDir,
      });
    }
  } finally {
    if (stagingRoot) {
      fs.rmSync(stagingRoot, { recursive: true, force: true });
    }
  }
}

function buildMissingShadcnScaffoldMessage(projectDir: string): string {
  const targetDir = normalizePath(relative(process.cwd(), projectDir) || '.');
  return [
    'Shadcn exited without creating a supported local scaffold.',
    'This usually means you chose the Custom preset.',
    `Run the generated shadcn command from ui.shadcn.com in ${targetDir} then re-run \`kitcn init --yes\` to adopt it.`,
  ].join(' ');
}

function moveStagedProjectIntoExistingDir(params: {
  stagedProjectDir: string;
  targetDir: string;
}) {
  if (!fs.existsSync(params.stagedProjectDir)) {
    throw new Error(buildMissingShadcnScaffoldMessage(params.targetDir));
  }
  if (
    !fs.existsSync(params.targetDir) ||
    fs.readdirSync(params.targetDir).length > 0
  ) {
    throw new Error(
      `Cannot move staged project into non-empty target ${params.targetDir}.`
    );
  }

  for (const entry of fs.readdirSync(params.stagedProjectDir)) {
    fs.renameSync(
      join(params.stagedProjectDir, entry),
      join(params.targetDir, entry)
    );
  }
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function normalizeRelativePathOrThrow(
  value: string,
  fieldName: string
): string {
  if (value.includes('\0')) {
    throw new Error(`Invalid ${fieldName}: null byte is not allowed.`);
  }
  if (isAbsolute(value)) {
    throw new Error(`Invalid ${fieldName}: absolute paths are not allowed.`);
  }
  const normalized = posix.normalize(value.replace(/\\/g, '/'));
  if (
    normalized.length === 0 ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('/')
  ) {
    throw new Error(`Invalid ${fieldName}: path traversal is not allowed.`);
  }
  return normalized;
}

function resolveConfigWritePath(configPathArg?: string): string {
  return resolve(process.cwd(), configPathArg ?? 'kitcn.json');
}

function overrideConfigBackend(
  config: CliConfig,
  backend: CliBackend
): CliConfig {
  if (config.backend === backend) {
    return config;
  }
  return {
    ...config,
    backend,
  };
}

type PackageManager = 'bun' | 'pnpm' | 'yarn' | 'npm';

type DependencyInstallItem = {
  installSpec: string;
  packageName: string;
};

type DependencyInstallPlan = {
  packageManager: PackageManager;
  command: string;
  args: string[];
  packages: string[];
  cwd: string;
};

type InitializationPlan = {
  config: CliConfig;
  functionsDir: string;
  files: PluginInstallPlanFile[];
  operations: PluginInstallPlanOperation[];
  dependencyInstall: DependencyInstallPlan | null;
  initialized: boolean;
};

export function resolveInitTargetCwd(args: InitCommandArgs): string {
  if (args.cwd && args.name) {
    return resolve(process.cwd(), args.cwd, args.name);
  }
  if (args.cwd) {
    return resolve(process.cwd(), args.cwd);
  }
  if (args.name) {
    return resolve(process.cwd(), args.name);
  }
  return process.cwd();
}

export const resolveInitProjectDir = resolveInitTargetCwd;

export function resolveSupportedInitTemplate(template: string | undefined) {
  if (template === undefined) {
    return undefined;
  }
  if ((SUPPORTED_INIT_TEMPLATES as readonly string[]).includes(template)) {
    return template;
  }
  throw new Error(
    `Unsupported init template "${template}". Expected one of: ${SUPPORTED_INIT_TEMPLATES.join(', ')}.`
  );
}

function buildInitNextOwnedScaffoldFiles(
  context: InitNextScaffoldContext,
  functionsDirRelative: string,
  backend: CliBackend,
  includeDemoFiles: boolean
): readonly InitOwnedTemplateScaffoldFile[] {
  const files: InitOwnedTemplateScaffoldFile[] = [
    {
      kind: 'config',
      relativePath: 'package.json',
      requiresExplicitOverwrite: false,
      content: ({ existingContent }) =>
        renderInitNextPackageJsonTemplate(existingContent, {
          backend,
          functionsDirRelative,
        }),
      createReason:
        'Create baseline package.json scripts for the Next scaffold.',
      updateReason: 'Update package.json scripts for the Next scaffold.',
      skipReason: 'package.json scripts already match the Next scaffold.',
    },
    {
      kind: 'env',
      relativePath: '.env.local',
      requiresExplicitOverwrite: false,
      content: ({ existingContent }) =>
        renderInitNextEnvLocalTemplate(existingContent),
      createReason: 'Create baseline .env.local for the Next scaffold.',
      updateReason: 'Update baseline .env.local for the Next scaffold.',
      skipReason: '.env.local already matches the Next scaffold.',
    },
    {
      kind: 'scaffold',
      relativePath: `${context.componentsDir}/providers.tsx`,
      requiresExplicitOverwrite: true,
      content: INIT_NEXT_PROVIDERS_TEMPLATE,
      createReason: `Create baseline ${context.componentsDir}/providers.tsx for the Next scaffold.`,
      updateReason: `Update ${context.componentsDir}/providers.tsx for the Next scaffold.`,
      skipReason: `${context.componentsDir}/providers.tsx already matches the Next scaffold.`,
    },
    {
      kind: 'scaffold',
      relativePath: `${context.convexClientDir}/query-client.ts`,
      requiresExplicitOverwrite: true,
      content: INIT_NEXT_QUERY_CLIENT_TEMPLATE,
      createReason: `Create baseline ${context.convexClientDir}/query-client.ts for the Next scaffold.`,
      updateReason: `Update ${context.convexClientDir}/query-client.ts for the Next scaffold.`,
      skipReason: `${context.convexClientDir}/query-client.ts already matches the Next scaffold.`,
    },
    {
      kind: 'scaffold',
      relativePath: `${context.convexClientDir}/crpc.tsx`,
      requiresExplicitOverwrite: true,
      content: INIT_NEXT_CLIENT_CRPC_TEMPLATE,
      createReason: `Create baseline ${context.convexClientDir}/crpc.tsx for the Next scaffold.`,
      updateReason: `Update ${context.convexClientDir}/crpc.tsx for the Next scaffold.`,
      skipReason: `${context.convexClientDir}/crpc.tsx already matches the Next scaffold.`,
    },
    {
      kind: 'scaffold',
      relativePath: `${context.convexClientDir}/convex-provider.tsx`,
      requiresExplicitOverwrite: true,
      content: INIT_NEXT_CONVEX_PROVIDER_TEMPLATE,
      preserveManagedContent: [AUTH_CONVEX_PROVIDER_TEMPLATE],
      createReason: `Create baseline ${context.convexClientDir}/convex-provider.tsx for the Next scaffold.`,
      updateReason: `Update ${context.convexClientDir}/convex-provider.tsx for the Next scaffold.`,
      skipReason: `${context.convexClientDir}/convex-provider.tsx already matches the Next scaffold.`,
    },
    {
      kind: 'scaffold',
      relativePath: `${context.convexClientDir}/server.ts`,
      requiresExplicitOverwrite: true,
      content: INIT_NEXT_SERVER_TEMPLATE,
      preserveManagedContent: [AUTH_NEXT_SERVER_TEMPLATE],
      createReason: `Create baseline ${context.convexClientDir}/server.ts for the Next scaffold.`,
      updateReason: `Update ${context.convexClientDir}/server.ts for the Next scaffold.`,
      skipReason: `${context.convexClientDir}/server.ts already matches the Next scaffold.`,
    },
    {
      kind: 'scaffold',
      relativePath: `${context.convexClientDir}/rsc.tsx`,
      requiresExplicitOverwrite: true,
      content: INIT_NEXT_RSC_TEMPLATE,
      createReason: `Create baseline ${context.convexClientDir}/rsc.tsx for the Next scaffold.`,
      updateReason: `Update ${context.convexClientDir}/rsc.tsx for the Next scaffold.`,
      skipReason: `${context.convexClientDir}/rsc.tsx already matches the Next scaffold.`,
    },
    {
      kind: 'config',
      relativePath: join(functionsDirRelative, 'tsconfig.json'),
      managedBaselineContent:
        getManagedConvexTsconfigBaselines(functionsDirRelative),
      requiresExplicitOverwrite: true,
      content: ({ existingContent }) =>
        typeof existingContent === 'string'
          ? patchInitConvexTsconfigContent(
              existingContent,
              functionsDirRelative
            )
          : renderInitConvexTsconfigTemplate(functionsDirRelative),
      createReason: `Create ${join(functionsDirRelative, 'tsconfig.json')} for kitcn functions.`,
      updateReason: `Patch ${join(functionsDirRelative, 'tsconfig.json')} for kitcn functions.`,
      skipReason: `${join(functionsDirRelative, 'tsconfig.json')} already matches the kitcn functions project.`,
    },
  ];

  if (includeDemoFiles) {
    files.push(
      {
        kind: 'scaffold',
        relativePath: `${context.appDir}/convex/page.tsx`,
        requiresExplicitOverwrite: true,
        content: INIT_NEXT_MESSAGES_PAGE_TEMPLATE,
        createReason: `Create ${context.appDir}/convex/page.tsx as the minimal kitcn demo route.`,
        updateReason: `Update ${context.appDir}/convex/page.tsx for the kitcn demo route.`,
        skipReason: `${context.appDir}/convex/page.tsx already matches the kitcn demo route.`,
      },
      {
        kind: 'schema',
        relativePath: `${functionsDirRelative}/schema.ts`,
        requiresExplicitOverwrite: true,
        content: INIT_NEXT_SCHEMA_TEMPLATE,
        createReason: `Create ${functionsDirRelative}/schema.ts with the minimal kitcn demo schema.`,
        updateReason: `Update ${functionsDirRelative}/schema.ts with the minimal kitcn demo schema.`,
        skipReason: `${functionsDirRelative}/schema.ts already matches the kitcn demo schema.`,
      },
      {
        kind: 'scaffold',
        relativePath: `${functionsDirRelative}/messages.ts`,
        requiresExplicitOverwrite: true,
        content: renderInitNextMessagesTemplate(functionsDirRelative),
        createReason: `Create ${functionsDirRelative}/messages.ts for the kitcn demo route.`,
        updateReason: `Update ${functionsDirRelative}/messages.ts for the kitcn demo route.`,
        skipReason: `${functionsDirRelative}/messages.ts already matches the kitcn demo route.`,
      }
    );
  }

  return files;
}

function buildInitReactOwnedScaffoldFiles(
  context: ReactScaffoldContext,
  functionsDirRelative: string,
  backend: CliBackend
): readonly InitOwnedTemplateScaffoldFile[] {
  return [
    {
      kind: 'config',
      relativePath: 'package.json',
      requiresExplicitOverwrite: false,
      content: ({ existingContent }) =>
        renderInitReactPackageJsonTemplate(existingContent, {
          backend,
          functionsDirRelative,
        }),
      createReason:
        'Create baseline package.json scripts for the React scaffold.',
      updateReason: 'Update package.json scripts for the React scaffold.',
      skipReason: 'package.json scripts already match the React scaffold.',
    },
    {
      kind: 'env',
      relativePath: '.env.local',
      requiresExplicitOverwrite: false,
      content: ({ existingContent }) =>
        renderInitReactEnvLocalTemplate(existingContent),
      createReason: 'Create baseline .env.local for the React scaffold.',
      updateReason: 'Update baseline .env.local for the React scaffold.',
      skipReason: '.env.local already matches the React scaffold.',
    },
    {
      kind: 'scaffold',
      relativePath: `${context.componentsDir}/providers.tsx`,
      requiresExplicitOverwrite: true,
      content: INIT_REACT_PROVIDERS_TEMPLATE,
      createReason: `Create baseline ${context.componentsDir}/providers.tsx for the React scaffold.`,
      updateReason: `Update ${context.componentsDir}/providers.tsx for the React scaffold.`,
      skipReason: `${context.componentsDir}/providers.tsx already matches the React scaffold.`,
    },
    {
      kind: 'scaffold',
      relativePath: `${context.convexClientDir}/query-client.ts`,
      requiresExplicitOverwrite: true,
      content: INIT_NEXT_QUERY_CLIENT_TEMPLATE,
      createReason: `Create baseline ${context.convexClientDir}/query-client.ts for the React scaffold.`,
      updateReason: `Update ${context.convexClientDir}/query-client.ts for the React scaffold.`,
      skipReason: `${context.convexClientDir}/query-client.ts already matches the React scaffold.`,
    },
    {
      kind: 'scaffold',
      relativePath: `${context.convexClientDir}/crpc.tsx`,
      requiresExplicitOverwrite: true,
      content: INIT_REACT_CLIENT_CRPC_TEMPLATE,
      createReason: `Create baseline ${context.convexClientDir}/crpc.tsx for the React scaffold.`,
      updateReason: `Update ${context.convexClientDir}/crpc.tsx for the React scaffold.`,
      skipReason: `${context.convexClientDir}/crpc.tsx already matches the React scaffold.`,
    },
    {
      kind: 'scaffold',
      relativePath: `${context.convexClientDir}/convex-provider.tsx`,
      requiresExplicitOverwrite: true,
      content: INIT_REACT_CONVEX_PROVIDER_TEMPLATE,
      preserveManagedContent: [AUTH_REACT_CONVEX_PROVIDER_TEMPLATE],
      createReason: `Create baseline ${context.convexClientDir}/convex-provider.tsx for the React scaffold.`,
      updateReason: `Update ${context.convexClientDir}/convex-provider.tsx for the React scaffold.`,
      skipReason: `${context.convexClientDir}/convex-provider.tsx already matches the React scaffold.`,
    },
    {
      kind: 'config',
      relativePath: join(functionsDirRelative, 'tsconfig.json'),
      managedBaselineContent:
        getManagedConvexTsconfigBaselines(functionsDirRelative),
      requiresExplicitOverwrite: true,
      content: ({ existingContent }) =>
        typeof existingContent === 'string'
          ? patchInitConvexTsconfigContent(
              existingContent,
              functionsDirRelative
            )
          : renderInitConvexTsconfigTemplate(functionsDirRelative),
      createReason: `Create ${join(functionsDirRelative, 'tsconfig.json')} for kitcn functions.`,
      updateReason: `Patch ${join(functionsDirRelative, 'tsconfig.json')} for kitcn functions.`,
      skipReason: `${join(functionsDirRelative, 'tsconfig.json')} already matches the kitcn functions project.`,
    },
  ] as const;
}

function buildInitStartOwnedScaffoldFiles(
  context: ReactScaffoldContext,
  functionsDirRelative: string,
  backend: CliBackend,
  includeDemoFiles: boolean
): readonly InitOwnedTemplateScaffoldFile[] {
  const rootPrefix = context.usesSrc ? 'src' : '';
  const files: InitOwnedTemplateScaffoldFile[] = [
    {
      kind: 'config',
      relativePath: 'package.json',
      requiresExplicitOverwrite: false,
      content: ({ existingContent }) =>
        renderInitReactPackageJsonTemplate(existingContent, {
          backend,
          functionsDirRelative,
        }),
      createReason:
        'Create baseline package.json scripts for the Start scaffold.',
      updateReason: 'Update package.json scripts for the Start scaffold.',
      skipReason: 'package.json scripts already match the Start scaffold.',
    },
    {
      kind: 'env',
      relativePath: '.env.local',
      requiresExplicitOverwrite: false,
      content: ({ existingContent }) =>
        renderInitReactEnvLocalTemplate(existingContent),
      createReason: 'Create baseline .env.local for the Start scaffold.',
      updateReason: 'Update baseline .env.local for the Start scaffold.',
      skipReason: '.env.local already matches the Start scaffold.',
    },
    {
      kind: 'scaffold',
      relativePath: `${context.componentsDir}/providers.tsx`,
      requiresExplicitOverwrite: true,
      content: INIT_REACT_PROVIDERS_TEMPLATE,
      createReason: `Create baseline ${context.componentsDir}/providers.tsx for the Start scaffold.`,
      updateReason: `Update ${context.componentsDir}/providers.tsx for the Start scaffold.`,
      skipReason: `${context.componentsDir}/providers.tsx already matches the Start scaffold.`,
    },
    {
      kind: 'scaffold',
      relativePath: `${context.convexClientDir}/query-client.ts`,
      requiresExplicitOverwrite: true,
      content: INIT_NEXT_QUERY_CLIENT_TEMPLATE,
      createReason: `Create baseline ${context.convexClientDir}/query-client.ts for the Start scaffold.`,
      updateReason: `Update ${context.convexClientDir}/query-client.ts for the Start scaffold.`,
      skipReason: `${context.convexClientDir}/query-client.ts already matches the Start scaffold.`,
    },
    {
      kind: 'scaffold',
      relativePath: `${context.convexClientDir}/crpc.tsx`,
      requiresExplicitOverwrite: true,
      content: INIT_START_CRPC_TEMPLATE,
      createReason: `Create baseline ${context.convexClientDir}/crpc.tsx for the Start scaffold.`,
      updateReason: `Update ${context.convexClientDir}/crpc.tsx for the Start scaffold.`,
      skipReason: `${context.convexClientDir}/crpc.tsx already matches the Start scaffold.`,
    },
    {
      kind: 'scaffold',
      relativePath: `${context.convexClientDir}/convex-provider.tsx`,
      requiresExplicitOverwrite: true,
      content: INIT_START_CONVEX_PROVIDER_TEMPLATE,
      preserveManagedContent: [AUTH_START_CONVEX_PROVIDER_TEMPLATE],
      createReason: `Create baseline ${context.convexClientDir}/convex-provider.tsx for the Start scaffold.`,
      updateReason: `Update ${context.convexClientDir}/convex-provider.tsx for the Start scaffold.`,
      skipReason: `${context.convexClientDir}/convex-provider.tsx already matches the Start scaffold.`,
    },
    {
      kind: 'scaffold',
      relativePath: trimLeadingSlashes(posix.join(rootPrefix, 'router.tsx')),
      requiresExplicitOverwrite: true,
      content: INIT_START_ROUTER_TEMPLATE,
      createReason: `Create baseline ${trimLeadingSlashes(posix.join(rootPrefix, 'router.tsx'))} for the Start scaffold.`,
      updateReason: `Update ${trimLeadingSlashes(posix.join(rootPrefix, 'router.tsx'))} for the Start scaffold.`,
      skipReason: `${trimLeadingSlashes(posix.join(rootPrefix, 'router.tsx'))} already matches the Start scaffold.`,
    },
    {
      kind: 'scaffold',
      relativePath: trimLeadingSlashes(
        posix.join(rootPrefix, 'routes', '__root.tsx')
      ),
      requiresExplicitOverwrite: true,
      content: INIT_START_ROOT_TEMPLATE,
      createReason: `Create baseline ${trimLeadingSlashes(posix.join(rootPrefix, 'routes', '__root.tsx'))} for the Start scaffold.`,
      updateReason: `Update ${trimLeadingSlashes(posix.join(rootPrefix, 'routes', '__root.tsx'))} for the Start scaffold.`,
      skipReason: `${trimLeadingSlashes(posix.join(rootPrefix, 'routes', '__root.tsx'))} already matches the Start scaffold.`,
    },
    {
      kind: 'config',
      relativePath: join(functionsDirRelative, 'tsconfig.json'),
      managedBaselineContent:
        getManagedConvexTsconfigBaselines(functionsDirRelative),
      requiresExplicitOverwrite: true,
      content: ({ existingContent }) =>
        typeof existingContent === 'string'
          ? patchInitConvexTsconfigContent(
              existingContent,
              functionsDirRelative
            )
          : renderInitConvexTsconfigTemplate(functionsDirRelative),
      createReason: `Create ${join(functionsDirRelative, 'tsconfig.json')} for kitcn functions.`,
      updateReason: `Patch ${join(functionsDirRelative, 'tsconfig.json')} for kitcn functions.`,
      skipReason: `${join(functionsDirRelative, 'tsconfig.json')} already matches the kitcn functions project.`,
    },
  ];

  if (includeDemoFiles) {
    files.push(
      {
        kind: 'scaffold',
        relativePath: trimLeadingSlashes(
          posix.join(rootPrefix, 'routes', 'index.tsx')
        ),
        requiresExplicitOverwrite: false,
        content: INIT_START_MESSAGES_PAGE_TEMPLATE,
        createReason: `Create ${trimLeadingSlashes(posix.join(rootPrefix, 'routes', 'index.tsx'))} as the minimal kitcn demo route.`,
        updateReason: `Update ${trimLeadingSlashes(posix.join(rootPrefix, 'routes', 'index.tsx'))} for the kitcn demo route.`,
        skipReason: `${trimLeadingSlashes(posix.join(rootPrefix, 'routes', 'index.tsx'))} already matches the kitcn demo route.`,
      },
      {
        kind: 'schema',
        relativePath: `${functionsDirRelative}/schema.ts`,
        requiresExplicitOverwrite: true,
        content: INIT_NEXT_SCHEMA_TEMPLATE,
        createReason: `Create ${functionsDirRelative}/schema.ts with the minimal kitcn demo schema.`,
        updateReason: `Update ${functionsDirRelative}/schema.ts with the minimal kitcn demo schema.`,
        skipReason: `${functionsDirRelative}/schema.ts already matches the kitcn demo schema.`,
      },
      {
        kind: 'scaffold',
        relativePath: `${functionsDirRelative}/messages.ts`,
        requiresExplicitOverwrite: true,
        content: renderInitNextMessagesTemplate(functionsDirRelative),
        createReason: `Create ${functionsDirRelative}/messages.ts for the kitcn demo route.`,
        updateReason: `Update ${functionsDirRelative}/messages.ts for the kitcn demo route.`,
        skipReason: `${functionsDirRelative}/messages.ts already matches the kitcn demo route.`,
      }
    );
  }

  return files;
}

function detectImportQuote(source: string): '"' | "'" {
  const match = source.match(INIT_NEXT_IMPORT_QUOTE_RE);
  return match?.[1] === "'" ? "'" : '"';
}

function trimLeadingSlashes(value: string): string {
  return value.replace(LEADING_SLASHES_RE, '');
}

function detectStatementTerminator(source: string): ';' | '' {
  return INIT_NEXT_IMPORT_SEMICOLON_RE.test(source) ? ';' : '';
}

function insertImportAfterLastImport(
  source: string,
  importStatement: string
): string {
  const lines = source.split('\n');
  let lastImportIndex = -1;

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]?.trim().startsWith('import ')) {
      lastImportIndex = i;
    }
  }

  if (lastImportIndex === -1) {
    throw new Error(
      'Could not patch Next layout: expected at least one import statement.'
    );
  }

  lines.splice(lastImportIndex + 1, 0, importStatement);
  return `${lines.join('\n').replace(INIT_NEXT_TRAILING_NEWLINES_RE, '')}\n`;
}

function patchInitNextLayoutContent(source: string): string {
  const wrappedChildren = '<Providers>{children}</Providers>';

  if (source.includes(wrappedChildren)) {
    if (INIT_NEXT_PROVIDERS_IMPORT_RE.test(source)) {
      return source.endsWith('\n') ? source : `${source}\n`;
    }

    const quote = detectImportQuote(source);
    const semicolon = detectStatementTerminator(source);
    return insertImportAfterLastImport(
      source,
      `import { Providers } from ${quote}@/components/providers${quote}${semicolon}`
    );
  }

  const childMatches = [...source.matchAll(INIT_NEXT_CHILDREN_SLOT_RE)];
  if (childMatches.length !== 1) {
    throw new Error(
      'Could not patch Next layout: expected exactly one `{children}` slot.'
    );
  }

  const nextSource = source.replace(
    INIT_NEXT_CHILDREN_SLOT_RE,
    wrappedChildren
  );

  if (INIT_NEXT_PROVIDERS_IMPORT_RE.test(nextSource)) {
    return nextSource.endsWith('\n') ? nextSource : `${nextSource}\n`;
  }

  const quote = detectImportQuote(nextSource);
  const semicolon = detectStatementTerminator(nextSource);

  return insertImportAfterLastImport(
    nextSource,
    `import { Providers } from ${quote}@/components/providers${quote}${semicolon}`
  );
}

function patchInitTsconfigContent(
  source: string,
  context: Pick<ProjectScaffoldContext, 'tsconfigAliasPath'>
): string {
  const parsedResult = ts.parseConfigFileTextToJson('tsconfig.json', source);
  if (parsedResult.error || parsedResult.config === undefined) {
    throw new Error(
      'Could not patch tsconfig.json: expected valid JSON or JSONC scaffold output.'
    );
  }
  const parsed: unknown = parsedResult.config;

  if (!isPlainObject(parsed)) {
    throw new Error(
      'Could not patch tsconfig.json: expected a top-level JSON object.'
    );
  }

  const compilerOptions = isPlainObject(parsed.compilerOptions)
    ? { ...parsed.compilerOptions }
    : {};
  const paths = isPlainObject(compilerOptions.paths)
    ? { ...compilerOptions.paths }
    : {};

  if (!('@/*' in paths)) {
    paths['@/*'] = [context.tsconfigAliasPath];
  }
  paths['@convex/*'] = ['./convex/shared/*'];

  return `${JSON.stringify(
    {
      ...parsed,
      compilerOptions: {
        ...compilerOptions,
        strictFunctionTypes: false,
        paths,
      },
    },
    null,
    2
  )}\n`;
}

function patchInitStartTsconfigContent(
  source: string,
  context: Pick<ProjectScaffoldContext, 'tsconfigAliasPath' | 'usesSrc'>
): string {
  const parsedResult = ts.parseConfigFileTextToJson('tsconfig.json', source);
  if (parsedResult.error || parsedResult.config === undefined) {
    throw new Error(
      'Could not patch tsconfig.json: expected valid JSON or JSONC scaffold output.'
    );
  }
  const parsed: unknown = parsedResult.config;

  if (!isPlainObject(parsed)) {
    throw new Error(
      'Could not patch tsconfig.json: expected a top-level JSON object.'
    );
  }

  const compilerOptions = isPlainObject(parsed.compilerOptions)
    ? { ...parsed.compilerOptions }
    : {};
  const paths = isPlainObject(compilerOptions.paths)
    ? { ...compilerOptions.paths }
    : {};

  if (!('@/*' in paths)) {
    paths['@/*'] = [context.tsconfigAliasPath];
  }
  paths['@convex/*'] = ['./convex/shared/*'];

  return `${JSON.stringify(
    {
      ...parsed,
      compilerOptions: {
        ...compilerOptions,
        strictFunctionTypes: false,
        paths,
      },
      ...(context.usesSrc ? { include: ['src'] } : {}),
    },
    null,
    2
  )}\n`;
}

function patchInitConvexTsconfigContent(
  source: string,
  functionsDirRelative: string
): string {
  const parsedResult = ts.parseConfigFileTextToJson('tsconfig.json', source);
  if (parsedResult.error || parsedResult.config === undefined) {
    throw new Error(
      'Could not patch Convex tsconfig.json: expected valid JSON or JSONC scaffold output.'
    );
  }
  const parsed: unknown = parsedResult.config;

  if (!isPlainObject(parsed)) {
    throw new Error(
      'Could not patch Convex tsconfig.json: expected a top-level JSON object.'
    );
  }

  const templateParsed = JSON.parse(
    renderInitConvexTsconfigTemplate(functionsDirRelative)
  ) as {
    compilerOptions?: Record<string, unknown>;
    include?: string[];
    exclude?: string[];
    [key: string]: unknown;
  };

  const compilerOptions = isPlainObject(parsed.compilerOptions)
    ? { ...parsed.compilerOptions }
    : {};
  const templateCompilerOptions = isPlainObject(templateParsed.compilerOptions)
    ? templateParsed.compilerOptions
    : {};
  const existingInclude = Array.isArray(parsed.include)
    ? parsed.include.filter(
        (value): value is string => typeof value === 'string'
      )
    : [];
  const templateInclude = Array.isArray(templateParsed.include)
    ? templateParsed.include
    : [];
  const existingExclude = Array.isArray(parsed.exclude)
    ? parsed.exclude.filter(
        (value): value is string => typeof value === 'string'
      )
    : [];
  const templateExclude = Array.isArray(templateParsed.exclude)
    ? templateParsed.exclude
    : [];

  return `${JSON.stringify(
    {
      ...parsed,
      compilerOptions: {
        ...compilerOptions,
        ...templateCompilerOptions,
      },
      include: [...new Set([...existingInclude, ...templateInclude])],
      exclude: [...new Set([...existingExclude, ...templateExclude])],
    },
    null,
    2
  )}\n`;
}

function renderLegacyGeneratedConvexTsconfigTemplate(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        allowJs: true,
        strict: true,
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        skipLibCheck: true,
        allowSyntheticDefaultImports: true,
        target: 'ESNext',
        lib: ['ES2023', 'dom'],
        forceConsistentCasingInFileNames: true,
        module: 'ESNext',
        isolatedModules: true,
        noEmit: true,
      },
      include: ['./**/*'],
      exclude: ['./_generated'],
    },
    null,
    2
  )}\n`;
}

function getManagedConvexTsconfigBaselines(
  functionsDirRelative: string
): readonly string[] {
  return [
    renderLegacyGeneratedConvexTsconfigTemplate(),
    ...(functionsDirRelative === 'convex'
      ? [renderLegacyManagedConvexRootTsconfigTemplate()]
      : []),
  ];
}

function renderLegacyManagedConvexRootTsconfigTemplate(): string {
  return `${JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/tsconfig',
      compilerOptions: {
        strict: true,
        strictFunctionTypes: false,
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        isolatedModules: true,
        skipLibCheck: true,
        noEmit: true,
        jsx: 'react-jsx',
        lib: ['esnext', 'dom'],
        types: ['bun-types'],
        target: 'esnext',
        moduleDetection: 'force',
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        allowJs: true,
      },
      include: ['**/*.ts', '**/*.tsx'],
      exclude: ['node_modules', '**/*.spec.ts', '**/*.test.ts'],
    },
    null,
    2
  )}\n`;
}

function isManagedLegacyConvexRootTsconfig(params: {
  filePath: string;
  functionsDir: string;
  existingContent: string;
}): boolean {
  const functionsRootDir = dirname(params.functionsDir);
  const functionsRootDirRelative = relative(process.cwd(), functionsRootDir);
  if (
    basename(params.functionsDir) !== 'functions' ||
    functionsRootDirRelative.length === 0 ||
    functionsRootDirRelative === '.'
  ) {
    return false;
  }

  const normalizedFunctionsRootDirRelative = normalizePath(
    functionsRootDirRelative
  );
  const candidates = [
    renderLegacyManagedConvexRootTsconfigTemplate(),
    renderInitConvexTsconfigTemplate(normalizedFunctionsRootDirRelative),
  ];

  return candidates.some((candidate) =>
    isContentEquivalent({
      filePath: params.filePath,
      existingContent: params.existingContent,
      nextContent: candidate,
    })
  );
}

function removeLegacyManagedConvexRootTsconfigIfNeeded(
  functionsDir: string
): void {
  const legacyRootTsconfigPath = join(dirname(functionsDir), 'tsconfig.json');
  if (!fs.existsSync(legacyRootTsconfigPath)) {
    return;
  }

  const existingContent = fs.readFileSync(legacyRootTsconfigPath, 'utf8');
  if (
    !isManagedLegacyConvexRootTsconfig({
      filePath: legacyRootTsconfigPath,
      functionsDir,
      existingContent,
    })
  ) {
    return;
  }

  fs.rmSync(legacyRootTsconfigPath, { force: true });
}

function patchInitReactMainContent(source: string): string {
  const wrappedApp = `<Providers>
        <App />
      </Providers>`;

  if (source.includes('<Providers>')) {
    return source.endsWith('\n') ? source : `${source}\n`;
  }

  let nextSource = source.replace(REACT_APP_MOUNT_RE, wrappedApp);

  if (nextSource === source) {
    throw new Error(
      'Could not patch React client entry: expected a single `<App />` mount.'
    );
  }

  if (!nextSource.includes("from '@/components/providers")) {
    const quote = detectImportQuote(nextSource);
    const semicolon = detectStatementTerminator(nextSource);
    nextSource = insertImportAfterLastImport(
      nextSource,
      `import { Providers } from ${quote}@/components/providers.tsx${quote}${semicolon}`
    );
  }

  return nextSource.endsWith('\n') ? nextSource : `${nextSource}\n`;
}

function patchInitReactViteConfigContent(source: string): string {
  if (source.includes("'@convex'") || source.includes('"@convex"')) {
    return source.endsWith('\n') ? source : `${source}\n`;
  }

  if (
    source.includes('viteTsConfigPaths(') ||
    source.includes('tsConfigPaths(')
  ) {
    return source.endsWith('\n') ? source : `${source}\n`;
  }

  if (!source.includes('alias: {')) {
    throw new Error(
      'Could not patch vite.config.ts: expected a resolve.alias block.'
    );
  }

  const nextSource = source.replace(
    'alias: {',
    `alias: {\n      '@convex': path.resolve(__dirname, './convex/shared'),`
  );

  return nextSource.endsWith('\n') ? nextSource : `${nextSource}\n`;
}

function patchInitNextComponentsJsonContent(
  source: string,
  context: InitNextScaffoldContext
): string {
  let parsed: unknown;

  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(
      'Could not patch components.json: expected valid JSON output from the Next scaffold.'
    );
  }

  if (!isPlainObject(parsed)) {
    throw new Error(
      'Could not patch components.json: expected a top-level JSON object.'
    );
  }

  const tailwind = isPlainObject(parsed.tailwind) ? { ...parsed.tailwind } : {};
  tailwind.css = context.tailwindCssPath;

  return `${JSON.stringify(
    {
      ...parsed,
      tailwind,
    },
    null,
    2
  )}\n`;
}

function patchInitNextEslintConfigContent(source: string): string {
  if (!source.includes('globalIgnores([')) {
    throw new Error(
      'Could not patch eslint.config.mjs: expected shadcn globalIgnores([...]) output.'
    );
  }

  const generatedPattern = '"**/*generated/**"';
  if (source.includes(generatedPattern)) {
    return source.endsWith('\n') ? source : `${source}\n`;
  }

  const nextSource = source.replace(
    'globalIgnores([',
    `globalIgnores([\n    ${generatedPattern},`
  );

  return nextSource.endsWith('\n') ? nextSource : `${nextSource}\n`;
}

function buildInitNextLayoutPlanFile(
  context: InitNextScaffoldContext
): PluginInstallPlanFile {
  const filePath = resolve(process.cwd(), context.appDir, 'layout.tsx');
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Could not patch ${normalizePath(relative(process.cwd(), filePath))}: shadcn did not create a layout file.`
    );
  }

  return createPlanFile({
    kind: 'scaffold',
    filePath,
    requiresExplicitOverwrite: false,
    content: patchInitNextLayoutContent(fs.readFileSync(filePath, 'utf8')),
    updateReason: `Patch ${context.appDir}/layout.tsx to mount Providers without replacing the shadcn shell.`,
    createReason: `Patch ${context.appDir}/layout.tsx to mount Providers without replacing the shadcn shell.`,
    skipReason: `${context.appDir}/layout.tsx already mounts Providers.`,
  });
}

function buildInitNextTsconfigPlanFile(
  context: InitNextScaffoldContext
): PluginInstallPlanFile {
  const filePath = resolve(process.cwd(), 'tsconfig.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(
      'Could not patch tsconfig.json: shadcn did not create a tsconfig file.'
    );
  }

  return createPlanFile({
    kind: 'config',
    filePath,
    requiresExplicitOverwrite: false,
    content: patchInitTsconfigContent(
      fs.readFileSync(filePath, 'utf8'),
      context
    ),
    updateReason:
      'Patch tsconfig.json to keep the shadcn alias and add @convex/*.',
    createReason:
      'Patch tsconfig.json to keep the shadcn alias and add @convex/*.',
    skipReason: 'tsconfig.json already includes the kitcn alias.',
  });
}

function buildInitReactRootTsconfigPlanFile(
  context: ReactScaffoldContext
): PluginInstallPlanFile {
  const filePath = resolve(process.cwd(), 'tsconfig.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(
      'Could not patch tsconfig.json: the React scaffold did not create a tsconfig file.'
    );
  }

  return createPlanFile({
    kind: 'config',
    filePath,
    requiresExplicitOverwrite: false,
    content:
      context.framework === 'tanstack-start'
        ? patchInitStartTsconfigContent(
            fs.readFileSync(filePath, 'utf8'),
            context
          )
        : patchInitTsconfigContent(fs.readFileSync(filePath, 'utf8'), context),
    updateReason:
      'Patch tsconfig.json to keep the app alias and add @convex/*.',
    createReason:
      'Patch tsconfig.json to keep the app alias and add @convex/*.',
    skipReason: 'tsconfig.json already includes the kitcn alias.',
  });
}

function buildInitReactAppTsconfigPlanFile(
  context: ReactScaffoldContext
): PluginInstallPlanFile[] {
  if (!context.tsconfigAppFile) {
    return [];
  }

  const filePath = resolve(process.cwd(), context.tsconfigAppFile);
  return [
    createPlanFile({
      kind: 'config',
      filePath,
      requiresExplicitOverwrite: false,
      content: patchInitTsconfigContent(
        fs.readFileSync(filePath, 'utf8'),
        context
      ),
      updateReason: `Patch ${context.tsconfigAppFile} to add @convex/*.`,
      createReason: `Patch ${context.tsconfigAppFile} to add @convex/*.`,
      skipReason: `${context.tsconfigAppFile} already includes the kitcn alias.`,
    }),
  ];
}

function buildInitReactViteConfigPlanFile(
  context: ReactScaffoldContext
): PluginInstallPlanFile[] {
  if (!context.viteConfigFile) {
    return [];
  }

  const filePath = resolve(process.cwd(), context.viteConfigFile);
  return [
    createPlanFile({
      kind: 'config',
      filePath,
      requiresExplicitOverwrite: false,
      content: patchInitReactViteConfigContent(
        fs.readFileSync(filePath, 'utf8')
      ),
      updateReason: `Patch ${context.viteConfigFile} to add the @convex alias.`,
      createReason: `Patch ${context.viteConfigFile} to add the @convex alias.`,
      skipReason: `${context.viteConfigFile} already includes the @convex alias.`,
    }),
  ];
}

function buildInitReactMainPlanFile(
  context: ReactScaffoldContext
): PluginInstallPlanFile {
  if (!context.clientEntryFile) {
    throw new Error(
      'React scaffolding requires a Vite-style client entry file (main.tsx/main.jsx).'
    );
  }
  const filePath = resolve(process.cwd(), context.clientEntryFile);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Could not patch ${context.clientEntryFile}: the React scaffold did not create a client entry file.`
    );
  }

  return createPlanFile({
    kind: 'scaffold',
    filePath,
    requiresExplicitOverwrite: false,
    content: patchInitReactMainContent(fs.readFileSync(filePath, 'utf8')),
    updateReason: `Patch ${context.clientEntryFile} to mount Providers.`,
    createReason: `Patch ${context.clientEntryFile} to mount Providers.`,
    skipReason: `${context.clientEntryFile} already mounts Providers.`,
  });
}

function buildInitNextComponentsJsonPlanFile(
  context: InitNextScaffoldContext
): PluginInstallPlanFile {
  const filePath = resolve(process.cwd(), 'components.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(
      'Could not patch components.json: shadcn did not create a components config.'
    );
  }

  return createPlanFile({
    kind: 'config',
    filePath,
    requiresExplicitOverwrite: false,
    content: patchInitNextComponentsJsonContent(
      fs.readFileSync(filePath, 'utf8'),
      context
    ),
    updateReason:
      'Patch components.json only when the tailwind css path needs to match the resolved app root.',
    createReason:
      'Patch components.json only when the tailwind css path needs to match the resolved app root.',
    skipReason:
      'components.json already points at the correct shadcn tailwind css file.',
  });
}

function buildInitNextEslintConfigPlanFile(): PluginInstallPlanFile | null {
  const filePath = resolve(process.cwd(), 'eslint.config.mjs');
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return createPlanFile({
    kind: 'config',
    filePath,
    requiresExplicitOverwrite: false,
    content: patchInitNextEslintConfigContent(
      fs.readFileSync(filePath, 'utf8')
    ),
    updateReason: 'Patch eslint.config.mjs to ignore generated kitcn files.',
    createReason: 'Patch eslint.config.mjs to ignore generated kitcn files.',
    skipReason: 'eslint.config.mjs already ignores generated kitcn files.',
  });
}

function resolveExistingFunctionsDirRelative(): string | null {
  const convexConfigPath = resolve(process.cwd(), 'convex.json');
  if (fs.existsSync(convexConfigPath)) {
    const raw = JSON.parse(fs.readFileSync(convexConfigPath, 'utf8')) as {
      functions?: unknown;
    };
    if (typeof raw.functions === 'string' && raw.functions.length > 0) {
      return normalizeRelativePathOrThrow(
        raw.functions,
        'convex.json.functions'
      );
    }
  }

  const legacyCandidates = [
    'convex/schema.ts',
    'convex/http.ts',
    'convex/plugins.lock.json',
  ].map((filePath) => resolve(process.cwd(), filePath));

  if (legacyCandidates.some((filePath) => fs.existsSync(filePath))) {
    return 'convex';
  }

  return null;
}

function buildTemplateInitializationPlanFiles(params: {
  backend: CliBackend;
  includeDemoFiles: boolean;
  template?: string;
  functionsDirRelative: string;
}): PluginInstallPlanFile[] {
  const projectContext = resolveProjectScaffoldContext({
    template: params.template,
    allowMissing: true,
    allowUnsupported: true,
  });

  if (!projectContext) {
    return [];
  }

  const ownedFiles =
    projectContext.mode === 'next-app'
      ? buildInitNextOwnedScaffoldFiles(
          projectContext,
          params.functionsDirRelative,
          params.backend,
          params.includeDemoFiles
        )
      : projectContext.framework === 'tanstack-start'
        ? buildInitStartOwnedScaffoldFiles(
            projectContext,
            params.functionsDirRelative,
            params.backend,
            params.includeDemoFiles
          )
        : buildInitReactOwnedScaffoldFiles(
            projectContext,
            params.functionsDirRelative,
            params.backend
          );

  const plannedOwnedFiles = ownedFiles.map((file) => {
    const filePath = resolve(process.cwd(), file.relativePath);
    const existingContent = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf8')
      : undefined;
    const nextContent =
      typeof file.content === 'function'
        ? file.content({ existingContent })
        : file.content;
    const content =
      typeof existingContent === 'string' &&
      file.preserveManagedContent?.some((managedContent) =>
        isContentEquivalent({
          filePath: file.relativePath,
          existingContent,
          nextContent: managedContent,
        })
      )
        ? existingContent
        : nextContent;

    return createPlanFile({
      kind: file.kind,
      filePath,
      content,
      managedBaselineContent: file.managedBaselineContent,
      requiresExplicitOverwrite: file.requiresExplicitOverwrite,
      createReason: file.createReason,
      updateReason: file.updateReason,
      skipReason: file.skipReason,
    });
  });

  if (projectContext.mode === 'next-app') {
    const eslintConfigPlanFile = buildInitNextEslintConfigPlanFile();
    return [
      ...plannedOwnedFiles,
      buildInitNextTsconfigPlanFile(projectContext),
      buildInitNextComponentsJsonPlanFile(projectContext),
      ...(eslintConfigPlanFile ? [eslintConfigPlanFile] : []),
      buildInitNextLayoutPlanFile(projectContext),
    ];
  }

  if (projectContext.framework === 'tanstack-start') {
    return [
      ...plannedOwnedFiles,
      buildInitReactRootTsconfigPlanFile(projectContext),
      ...buildInitReactViteConfigPlanFile(projectContext),
    ];
  }

  return [
    ...plannedOwnedFiles,
    buildInitReactRootTsconfigPlanFile(projectContext),
    ...buildInitReactAppTsconfigPlanFile(projectContext),
    ...buildInitReactViteConfigPlanFile(projectContext),
    buildInitReactMainPlanFile(projectContext),
  ];
}

function detectPackageManager(projectDir: string): PackageManager {
  let current = resolve(projectDir);
  while (true) {
    const packageJsonPath = join(current, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
          packageManager?: unknown;
        };
        if (typeof pkg.packageManager === 'string') {
          if (pkg.packageManager.startsWith('bun@')) return 'bun';
          if (pkg.packageManager.startsWith('pnpm@')) return 'pnpm';
          if (pkg.packageManager.startsWith('yarn@')) return 'yarn';
          if (pkg.packageManager.startsWith('npm@')) return 'npm';
        }
      } catch {
        // ignore invalid package.json here; later reads will fail loudly if needed
      }
    }

    if (
      fs.existsSync(join(current, 'bun.lock')) ||
      fs.existsSync(join(current, 'bun.lockb'))
    ) {
      return 'bun';
    }
    if (
      fs.existsSync(join(current, 'pnpm-lock.yaml')) ||
      fs.existsSync(join(current, 'pnpm-workspace.yaml'))
    ) {
      return 'pnpm';
    }
    if (fs.existsSync(join(current, 'yarn.lock'))) {
      return 'yarn';
    }
    if (fs.existsSync(join(current, 'package-lock.json'))) {
      return 'npm';
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return 'bun';
}

function resolveShadcnScaffoldProjectDir(
  projectDir: string,
  template?: string
): string {
  if (template !== 'next') {
    return projectDir;
  }

  const appsDir = join(projectDir, 'apps');
  if (!fs.existsSync(appsDir)) {
    return projectDir;
  }

  for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const candidateDir = join(appsDir, entry.name);
    if (
      fs.existsSync(join(candidateDir, 'package.json')) &&
      fs.existsSync(join(candidateDir, 'components.json')) &&
      (fs.existsSync(join(candidateDir, 'app')) ||
        fs.existsSync(join(candidateDir, 'src', 'app')))
    ) {
      return candidateDir;
    }
  }

  return projectDir;
}

function buildDependencyInstallPlan(
  projectDir: string,
  dependencies: readonly DependencyInstallItem[]
): DependencyInstallPlan | null {
  const packageJsonPath = join(projectDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const existing = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };
  const missing = dependencies.filter(
    (dependency) => !(dependency.packageName in existing)
  );
  if (missing.length === 0) {
    return null;
  }

  const packageManager = detectPackageManager(projectDir);
  const missingSpecs = missing.map((dependency) => dependency.installSpec);
  const args =
    packageManager === 'npm'
      ? ['install', ...missingSpecs]
      : ['add', ...missingSpecs];

  return {
    packageManager,
    command: packageManager,
    args,
    packages: missingSpecs,
    cwd: projectDir,
  };
}

export function isInitialized(params: {
  functionsDir: string;
  config: CliConfig;
}): boolean {
  return (
    fs.existsSync(getSchemaFilePath(params.functionsDir)) &&
    fs.existsSync(getHttpFilePath(params.functionsDir)) &&
    fs.existsSync(getCrpcFilePath(params.config))
  );
}

export function buildInitializationPlan(params: {
  config: CliConfig;
  kitcnInstallSpec?: string;
  configPathArg?: string;
  envFields?: readonly PluginEnvField[];
  template?: string;
}): InitializationPlan {
  const existingFunctionsDirRelative = resolveExistingFunctionsDirRelative();
  const functionsDirRelative =
    existingFunctionsDirRelative ?? 'convex/functions';
  const functionsDir = resolve(process.cwd(), functionsDirRelative);
  const currentConfig = params.config;
  const envBootstrap = buildEnvBootstrapFiles(
    currentConfig,
    params.configPathArg,
    params.envFields ?? []
  );
  const nextConfig = envBootstrap.config;
  const crpcFilePath = getCrpcFilePath(nextConfig);
  const httpFilePath = getHttpFilePath(functionsDir);
  const schemaFilePath = getSchemaFilePath(functionsDir);
  const convexConfigPath = resolve(process.cwd(), 'convex.json');
  const projectContext = resolveProjectScaffoldContext({
    template: params.template,
    allowMissing: true,
    allowUnsupported: true,
  });
  const shouldSeedBaselineSchema = existingFunctionsDirRelative === null;
  const files: PluginInstallPlanFile[] = [];
  const templateFiles = buildTemplateInitializationPlanFiles({
    backend: currentConfig.backend,
    includeDemoFiles: existingFunctionsDirRelative === null,
    template: params.template,
    functionsDirRelative,
  });

  if (functionsDirRelative !== 'convex' || fs.existsSync(convexConfigPath)) {
    files.push(
      createPlanFile({
        kind: 'config',
        filePath: convexConfigPath,
        content: INIT_CONVEX_CONFIG_TEMPLATE,
        managedBaselineContent: INIT_CONVEX_CONFIG_TEMPLATE,
        requiresExplicitOverwrite: true,
        createReason: 'Create Convex config for functions bootstrap.',
        updateReason: 'Update Convex config for kitcn bootstrap.',
        skipReason: 'Convex config is already bootstrapped.',
      })
    );
  }

  files.push(
    ...envBootstrap.files.map((file) => {
      const details = resolveEnvBootstrapPlanFileDetails(file.templateId);
      return createPlanFile({
        kind: details.kind,
        templateId: file.templateId,
        filePath: file.filePath,
        content: file.content,
        requiresExplicitOverwrite:
          file.templateId !== LOCAL_CONVEX_ENV_TEMPLATE_ID,
        managedBaselineContent:
          file.templateId === KITCN_CONFIG_TEMPLATE_ID
            ? file.content
            : file.templateId === KITCN_ENV_HELPER_TEMPLATE_ID
              ? renderEnvHelperContent([], undefined)
              : file.templateId === LOCAL_CONVEX_ENV_TEMPLATE_ID
                ? renderLocalConvexEnvContent([], undefined)
                : undefined,
        createReason: details.createReason,
        updateReason: details.updateReason,
        skipReason: details.skipReason,
      });
    })
  );

  if (shouldSeedBaselineSchema) {
    files.push(
      createPlanFile({
        kind: 'schema',
        filePath: schemaFilePath,
        content: INIT_SCHEMA_TEMPLATE,
        createReason: 'Create baseline schema.ts.',
        updateReason: 'Update baseline schema.ts.',
        skipReason: 'Baseline schema.ts is already bootstrapped.',
      })
    );
  }

  const baselineCrpcContent = renderInitTemplateContent({
    template: INIT_CRPC_TEMPLATE,
    filePath: crpcFilePath,
    functionsDir,
    crpcFilePath,
  });
  const existingCrpcContent = fs.existsSync(crpcFilePath)
    ? fs.readFileSync(crpcFilePath, 'utf8')
    : undefined;
  const crpcContent =
    typeof existingCrpcContent === 'string' &&
    [
      renderAuthCrpcTemplate({ withRatelimit: false }),
      renderAuthCrpcTemplate({ withRatelimit: true }),
    ].some((managedContent) =>
      isContentEquivalent({
        filePath: crpcFilePath,
        existingContent: existingCrpcContent,
        nextContent: managedContent,
      })
    )
      ? existingCrpcContent
      : baselineCrpcContent;

  files.push(
    createPlanFile({
      kind: 'scaffold',
      filePath: crpcFilePath,
      content: crpcContent,
      managedBaselineContent: baselineCrpcContent,
      requiresExplicitOverwrite: true,
      createReason: 'Create baseline crpc.ts.',
      updateReason: 'Update baseline crpc.ts.',
      skipReason: 'Baseline crpc.ts is already bootstrapped.',
    }),
    createPlanFile({
      kind: 'scaffold',
      filePath: httpFilePath,
      content: renderInitTemplateContent({
        template: INIT_HTTP_TEMPLATE,
        filePath: httpFilePath,
        functionsDir,
        crpcFilePath,
      }),
      managedBaselineContent: renderInitTemplateContent({
        template: INIT_HTTP_TEMPLATE,
        filePath: httpFilePath,
        functionsDir,
        crpcFilePath,
      }),
      requiresExplicitOverwrite: true,
      createReason: 'Create baseline http.ts.',
      updateReason: 'Update baseline http.ts.',
      skipReason: 'Baseline http.ts is already bootstrapped.',
    })
  );

  files.push(...templateFiles);

  const dependencyPackages = projectContext
    ? [
        ...BASELINE_DEPENDENCY_INSTALL_SPECS.map((installSpec) => ({
          installSpec,
          packageName: getPackageNameFromInstallSpec(installSpec),
        })),
        {
          installSpec: params.kitcnInstallSpec ?? resolveScaffoldInstallSpec(),
          packageName: 'kitcn',
        },
        ...INIT_TEMPLATE_DEPENDENCY_INSTALL_SPECS.map((installSpec) => ({
          installSpec,
          packageName: getPackageNameFromInstallSpec(installSpec),
        })),
      ]
    : [
        ...BASELINE_DEPENDENCY_INSTALL_SPECS.map((installSpec) => ({
          installSpec,
          packageName: getPackageNameFromInstallSpec(installSpec),
        })),
        {
          installSpec: params.kitcnInstallSpec ?? resolveScaffoldInstallSpec(),
          packageName: 'kitcn',
        },
      ];
  const dependencyInstall = buildDependencyInstallPlan(
    process.cwd(),
    dependencyPackages
  );
  const operations: PluginInstallPlanOperation[] = [];
  if (dependencyInstall) {
    operations.push({
      kind: 'dependency_install',
      status: 'pending',
      reason: 'Install baseline kitcn dependencies.',
      command: `${dependencyInstall.command} ${dependencyInstall.args.join(' ')}`,
    });
  }

  return {
    config: nextConfig,
    functionsDir,
    files,
    operations,
    dependencyInstall,
    initialized: isInitialized({
      functionsDir,
      config: nextConfig,
    }),
  };
}

export async function applyDependencyInstallPlan(
  plan: DependencyInstallPlan | null,
  execaFn: typeof execa
): Promise<void> {
  if (!plan) {
    return;
  }

  const result = await execaFn(plan.command, plan.args, {
    cwd: plan.cwd,
    env: createCommandEnv(),
    reject: false,
    stdio: 'inherit',
  });
  if ((result.exitCode ?? 0) !== 0) {
    throw new Error(
      `Dependency install failed: ${plan.command} ${plan.args.join(' ')}`
    );
  }
}

export async function withWorkingDirectory<T>(
  cwd: string,
  fn: () => Promise<T>
): Promise<T> {
  const previousCwd = process.cwd();
  fs.mkdirSync(cwd, { recursive: true });
  process.chdir(cwd);
  try {
    return await fn();
  } finally {
    process.chdir(previousCwd);
  }
}

async function runScaffoldCommandFlow(params: {
  projectDir: string;
  template?: string;
  yes: boolean;
  defaults?: boolean;
  allowCodegenBootstrapFallback?: boolean;
  overwrite?: boolean;
  targetArgs?: string[];
  backendArg?: CliBackend;
  configPath?: string;
  execaFn: typeof execa;
  generateMetaFn: typeof generateMeta;
  syncEnvFn: typeof syncEnv;
  loadCliConfigFn: typeof loadCliConfig;
  ensureConvexGitignoreEntryFn: typeof ensureConvexGitignoreEntry;
  promptAdapter: PromptAdapter;
  realConvexPath: string;
  realConcavePath?: string;
}): Promise<InitRunResult> {
  if (params.template) {
    await createProjectWithShadcn({
      projectDir: params.projectDir,
      template: params.template,
      yes: params.yes,
      defaults: params.defaults ?? false,
      execaFn: params.execaFn,
    });
  }

  const scaffoldProjectDir = resolveShadcnScaffoldProjectDir(
    params.projectDir,
    params.template
  );
  if (
    params.template &&
    !resolveProjectScaffoldContext({
      cwd: scaffoldProjectDir,
      allowMissing: true,
      allowUnsupported: true,
    })
  ) {
    throw new Error(buildMissingShadcnScaffoldMessage(scaffoldProjectDir));
  }

  return withWorkingDirectory(scaffoldProjectDir, async () => {
    const config = params.loadCliConfigFn(params.configPath);
    const backend = resolveConfiguredBackend({
      backendArg: params.backendArg,
      config,
    });
    if (backend === 'concave' && (params.targetArgs?.length ?? 0) > 0) {
      throw new Error(
        'Convex deployment target flags are only supported on backend convex.'
      );
    }
    const configWithResolvedBackend = overrideConfigBackend(config, backend);
    const initPlan = buildInitializationPlan({
      kitcnInstallSpec: resolveScaffoldInstallSpec(),
      config: configWithResolvedBackend,
      configPathArg: params.configPath,
      template: params.template,
    });
    const applyResult = await applyPluginInstallPlanFiles(initPlan.files, {
      overwrite: Boolean(params.overwrite) || params.template !== undefined,
      yes: params.yes || Boolean(params.defaults),
      promptAdapter: params.promptAdapter,
    });
    removeLegacyManagedConvexRootTsconfigIfNeeded(initPlan.functionsDir);
    await applyDependencyInstallPlan(
      initPlan.dependencyInstall,
      params.execaFn
    );

    try {
      params.ensureConvexGitignoreEntryFn(process.cwd());
    } catch (error) {
      logger.warn(
        `⚠️  Failed to ensure .convex/ and .concave/ are ignored in .gitignore: ${(error as Error).message}`
      );
    }

    const codegenResult = await runInitializationCodegen({
      allowCodegenBootstrapFallback:
        params.allowCodegenBootstrapFallback ?? true,
      config: initPlan.config,
      backend,
      yes: params.yes,
      sharedDir: initPlan.config.paths.shared,
      debug: initPlan.config.codegen.debug,
      generateMetaFn: params.generateMetaFn,
      syncEnvFn: params.syncEnvFn,
      execaFn: params.execaFn,
      realConvexPath: params.realConvexPath,
      realConcavePath: params.realConcavePath,
      functionsDir: initPlan.functionsDir,
      template: params.template,
      targetArgs: params.targetArgs,
    });

    return {
      backend,
      cwd: scaffoldProjectDir,
      created: applyResult.created,
      updated: applyResult.updated,
      skipped: applyResult.skipped,
      usedShadcn: params.template !== undefined,
      template: params.template ?? null,
      codegen: codegenResult.codegen,
      convexBootstrap: codegenResult.convexBootstrap,
      localBootstrapUsed: codegenResult.localBootstrapUsed,
    };
  });
}

export async function runInitCommandFlow(params: {
  initArgs: InitCommandArgs;
  backendArg?: CliBackend;
  configPath?: string;
  execaFn: typeof execa;
  generateMetaFn: typeof generateMeta;
  syncEnvFn: typeof syncEnv;
  loadCliConfigFn: typeof loadCliConfig;
  ensureConvexGitignoreEntryFn: typeof ensureConvexGitignoreEntry;
  promptAdapter: PromptAdapter;
  realConvexPath: string;
  realConcavePath?: string;
}): Promise<InitRunResult> {
  const template = resolveSupportedInitTemplate(params.initArgs.template);
  const projectDir = resolveInitProjectDir(params.initArgs);
  const existingProjectContext = resolveProjectScaffoldContext({
    cwd: projectDir,
    allowMissing: true,
    allowUnsupported: true,
  });
  const wantsFreshScaffold =
    template !== undefined ||
    params.initArgs.defaults ||
    params.initArgs.name !== undefined;

  if (wantsFreshScaffold) {
    if (!template) {
      throw new Error(
        'Fresh app scaffolding requires `kitcn init -t <next|start|vite>`.'
      );
    }
    if (existingProjectContext) {
      throw new Error(
        `Existing supported app scaffold detected. Run \`kitcn init --yes\` in ${normalizePath(
          relative(process.cwd(), projectDir) || '.'
        )} to adopt the current project.`
      );
    }

    return runScaffoldCommandFlow({
      allowCodegenBootstrapFallback: !params.initArgs.json,
      projectDir,
      template,
      yes: params.initArgs.yes,
      defaults: params.initArgs.defaults,
      overwrite: params.initArgs.overwrite,
      targetArgs: params.initArgs.targetArgs,
      backendArg: params.backendArg,
      configPath: params.configPath,
      execaFn: params.execaFn,
      generateMetaFn: params.generateMetaFn,
      syncEnvFn: params.syncEnvFn,
      loadCliConfigFn: params.loadCliConfigFn,
      ensureConvexGitignoreEntryFn: params.ensureConvexGitignoreEntryFn,
      promptAdapter: params.promptAdapter,
      realConvexPath: params.realConvexPath,
      realConcavePath: params.realConcavePath,
    });
  }

  if (!existingProjectContext) {
    throw new Error(
      'Could not detect a supported app scaffold. Use `kitcn init -t <next|start|vite>` for a fresh app.'
    );
  }

  return runScaffoldCommandFlow({
    allowCodegenBootstrapFallback: !params.initArgs.json,
    projectDir,
    yes: params.initArgs.yes,
    overwrite: params.initArgs.overwrite,
    targetArgs: params.initArgs.targetArgs,
    backendArg: params.backendArg,
    configPath: params.configPath,
    execaFn: params.execaFn,
    generateMetaFn: params.generateMetaFn,
    syncEnvFn: params.syncEnvFn,
    loadCliConfigFn: params.loadCliConfigFn,
    ensureConvexGitignoreEntryFn: params.ensureConvexGitignoreEntryFn,
    promptAdapter: params.promptAdapter,
    realConvexPath: params.realConvexPath,
    realConcavePath: params.realConcavePath,
  });
}

export function formatInfoOutput(payload: {
  schemaPlugins: SupportedPlugin[];
  installedPlugins: InstalledPluginState[];
  project: {
    backend: CliBackend;
    functionsDir: string;
    schemaPath: string;
    schemaExists: boolean;
    lockfilePath: string;
    lockfileExists: boolean;
    packageJsonPath?: string;
    kitcnVersion?: string;
    convexVersion?: string;
    configPath: string;
    config: {
      lib: string;
      shared: string;
      env: string | null;
    };
  };
  mismatches: {
    schemaOnly: SupportedPlugin[];
    lockfileOnly: string[];
  };
}): string {
  const lines = [
    `${highlighter.bold('┌')} ${highlighter.bold('kitcn info')}`,
    highlighter.dim('│'),
    `${highlighter.dim('├')} ${highlighter.bold('Project')}`,
    `${highlighter.dim('│')} ${highlighter.dim('backend')} ${payload.project.backend}`,
    `${highlighter.dim('│')} ${highlighter.dim('functions')} ${payload.project.functionsDir}`,
    `${highlighter.dim('│')} ${highlighter.dim('schema')} ${
      payload.project.schemaExists
        ? highlighter.path(payload.project.schemaPath)
        : highlighter.warn('missing')
    }`,
    `${highlighter.dim('│')} ${highlighter.dim('lockfile')} ${
      payload.project.lockfileExists
        ? highlighter.path(payload.project.lockfilePath)
        : highlighter.warn('missing')
    }`,
    `${highlighter.dim('│')} ${highlighter.dim('kitcn')} ${
      payload.project.kitcnVersion ?? 'unknown'
    }`,
    `${highlighter.dim('│')} ${highlighter.dim('convex')} ${
      payload.project.convexVersion ?? 'unknown'
    }`,
    `${highlighter.dim('│')} ${highlighter.dim('config')} ${payload.project.configPath}`,
    highlighter.dim('│'),
    `${highlighter.dim('├')} ${highlighter.bold('Plugins')}`,
  ];

  if (payload.installedPlugins.length === 0) {
    lines.push(`${highlighter.dim('│')} ${highlighter.dim('none')}`);
  } else {
    for (const plugin of payload.installedPlugins) {
      const status = plugin.clean
        ? highlighter.success('clean')
        : highlighter.warn(`${plugin.driftedFiles} drifted file(s)`);
      const dependency = plugin.missingDependency
        ? ` ${highlighter.warn('missing dependency')}`
        : '';
      lines.push(
        `${highlighter.dim('│')} ${highlighter.path(plugin.plugin)} ${status}${dependency}`
      );
    }
  }

  if (
    payload.mismatches.schemaOnly.length > 0 ||
    payload.mismatches.lockfileOnly.length > 0
  ) {
    lines.push(highlighter.dim('│'));
    lines.push(`${highlighter.dim('├')} ${highlighter.bold('Mismatches')}`);
    if (payload.mismatches.schemaOnly.length > 0) {
      lines.push(
        `${highlighter.dim('│')} ${highlighter.dim('schema only')} ${payload.mismatches.schemaOnly.join(', ')}`
      );
    }
    if (payload.mismatches.lockfileOnly.length > 0) {
      lines.push(
        `${highlighter.dim('│')} ${highlighter.dim('lockfile only')} ${payload.mismatches.lockfileOnly.join(', ')}`
      );
    }
  }

  lines.push(
    `${highlighter.dim('└')} ${highlighter.dim(payload.project.config.lib)}`
  );
  return lines.join('\n');
}

export function formatDocsOutput(
  results: Array<{
    topic: string;
    title: string;
    localPath: string;
    publicUrl?: string;
  }>
): string {
  const lines = [`${highlighter.bold('┌')} ${highlighter.bold('kitcn docs')}`];

  for (const result of results) {
    lines.push(highlighter.dim('│'));
    lines.push(`${highlighter.dim('├')} ${highlighter.bold(result.topic)}`);
    lines.push(
      `${highlighter.dim('│')} ${highlighter.dim('local')}  ${highlighter.path(result.localPath)}`
    );
    if (result.publicUrl) {
      lines.push(
        `${highlighter.dim('│')} ${highlighter.dim('public')} ${highlighter.info(result.publicUrl)}`
      );
    }
  }

  lines.push(
    `${highlighter.dim('└')} ${highlighter.dim('Use --json for machine-readable output.')}`
  );
  return lines.join('\n');
}

export function readPackageVersions(startDir: string): {
  packageJsonPath?: string;
  kitcnVersion?: string;
  convexVersion?: string;
} {
  const packageJsonPath = findNearestPackageJsonPath(startDir);
  if (!packageJsonPath) {
    return {};
  }
  const packageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, 'utf8')
  ) as Record<string, unknown>;
  const readVersion = (packageName: string) => {
    const sections = [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ] as const;
    for (const section of sections) {
      const entries = packageJson[section];
      if (
        typeof entries === 'object' &&
        entries !== null &&
        !Array.isArray(entries)
      ) {
        const version = (entries as Record<string, unknown>)[packageName];
        if (typeof version === 'string') {
          return version;
        }
      }
    }
    return undefined;
  };

  return {
    packageJsonPath,
    kitcnVersion: readVersion('kitcn'),
    convexVersion: readVersion('convex'),
  };
}

export function resolveDocTopic(topic: string): CliDocEntry | undefined {
  if (topic in CORE_DOC_TOPICS) {
    return CORE_DOC_TOPICS[topic];
  }
  return resolvePluginDocTopic(topic);
}

export async function applyPluginInstallPlanFiles(
  files: readonly PluginInstallPlanFile[],
  options: {
    overwrite: boolean;
    yes: boolean;
    promptAdapter: PromptAdapter;
  }
): Promise<{
  created: string[];
  manualActions: string[];
  updated: string[];
  skipped: string[];
}> {
  const result = {
    created: [] as string[],
    manualActions: [] as string[],
    updated: [] as string[],
    skipped: [] as string[],
  };

  for (const file of files) {
    if (file.manualActions?.length) {
      result.manualActions.push(...file.manualActions);
    }
    const absolutePath = resolve(process.cwd(), file.path);
    if (file.action === 'skip') {
      result.skipped.push(file.path);
      continue;
    }

    if (file.action === 'create') {
      fs.mkdirSync(dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, file.content);
      result.created.push(file.path);
      continue;
    }

    const managedBaselines = Array.isArray(file.managedBaselineContent)
      ? file.managedBaselineContent
      : typeof file.managedBaselineContent === 'string'
        ? [file.managedBaselineContent]
        : [];
    const requiresExplicitOverwrite =
      file.requiresExplicitOverwrite ??
      (file.kind === 'config' ||
        (file.kind === 'scaffold' && file.templateId !== undefined) ||
        (file.kind === 'env' &&
          file.templateId !== LOCAL_CONVEX_ENV_TEMPLATE_ID &&
          file.templateId !== KITCN_ENV_HELPER_TEMPLATE_ID));
    const existingContent = file.existingContent;
    const matchesManagedBaseline =
      typeof existingContent === 'string' &&
      managedBaselines.some((managedBaselineContent) =>
        isContentEquivalent({
          filePath: file.path,
          existingContent,
          nextContent: managedBaselineContent,
        })
      );
    let shouldOverwrite =
      options.overwrite || !requiresExplicitOverwrite || matchesManagedBaseline;
    if (
      !shouldOverwrite &&
      !options.yes &&
      options.promptAdapter.isInteractive()
    ) {
      shouldOverwrite = await options.promptAdapter.confirm(
        `Overwrite ${file.path}?`
      );
    }

    if (!shouldOverwrite) {
      result.skipped.push(file.path);
      continue;
    }

    fs.mkdirSync(dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, file.content);
    result.updated.push(file.path);
  }

  return result;
}

type AggregateFingerprintState = {
  version: number;
  entries: Record<
    string,
    {
      fingerprint: string;
      updatedAt: number;
    }
  >;
};

const DEFAULT_AGGREGATE_FINGERPRINT_STATE: AggregateFingerprintState = {
  version: AGGREGATE_STATE_VERSION,
  entries: {},
};

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return [
    ...new Set(
      values.filter((value): value is string => typeof value === 'string')
    ),
  ].sort();
}

function readOptionalCliFlagValue(
  args: string[],
  flag: string
): string | undefined {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === flag) {
      const value = args[i + 1];
      if (value) {
        return value;
      }
      continue;
    }
    const withEquals = `${flag}=`;
    if (arg.startsWith(withEquals)) {
      const value = arg.slice(withEquals.length);
      if (value) {
        return value;
      }
    }
  }
  return;
}

function resolveSchemaDefaultExport(
  schemaModule: Record<string, unknown>
): Record<string, unknown> | null {
  const schemaValue =
    schemaModule.default !== undefined ? schemaModule.default : schemaModule;
  if (!schemaValue || typeof schemaValue !== 'object') {
    return null;
  }
  return schemaValue as Record<string, unknown>;
}

function collectSchemaTables(schemaValue: Record<string, unknown>): unknown[] {
  const allTables = new Set<unknown>();
  const relations = getSchemaRelations(schemaValue);
  if (relations && typeof relations === 'object' && !Array.isArray(relations)) {
    for (const relationConfig of Object.values(
      relations as Record<string, unknown>
    )) {
      const table = (relationConfig as { table?: unknown })?.table;
      if (table) {
        allTables.add(table);
      }
    }
  }

  const tables = schemaValue.tables;
  if (tables && typeof tables === 'object' && !Array.isArray(tables)) {
    for (const table of Object.values(tables as Record<string, unknown>)) {
      if (table) {
        allTables.add(table);
      }
    }
  }

  return [...allTables];
}

function buildAggregateFingerprintPayload(tables: unknown[]): Array<{
  tableName: string;
  aggregateIndexes: Array<{
    name: string;
    fields: string[];
    countFields: string[];
    sumFields: string[];
    avgFields: string[];
    minFields: string[];
    maxFields: string[];
  }>;
}> {
  return tables
    .map((table) => getTableConfig(table as any))
    .map((tableConfig) => ({
      tableName: tableConfig.name,
      aggregateIndexes: tableConfig.aggregateIndexes
        .map((index) => ({
          name: index.name,
          fields: normalizeStringList(index.fields),
          countFields: normalizeStringList(index.countFields),
          sumFields: normalizeStringList(index.sumFields),
          avgFields: normalizeStringList(index.avgFields),
          minFields: normalizeStringList(index.minFields),
          maxFields: normalizeStringList(index.maxFields),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.tableName.localeCompare(b.tableName));
}

async function computeAggregateIndexFingerprint(
  functionsDir: string
): Promise<string | null> {
  const schemaPath = join(functionsDir, 'schema.ts');
  if (!fs.existsSync(schemaPath)) {
    return null;
  }

  const jiti = createProjectJiti();
  const schemaModule = await jiti.import(schemaPath);
  if (!schemaModule || typeof schemaModule !== 'object') {
    return null;
  }
  const schemaValue = resolveSchemaDefaultExport(
    schemaModule as Record<string, unknown>
  );
  if (!schemaValue) {
    return null;
  }

  const tables = collectSchemaTables(schemaValue);
  if (tables.length === 0) {
    return null;
  }

  const payload = buildAggregateFingerprintPayload(tables);
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function getDevAggregateBackfillStatePath(cwd = process.cwd()): string {
  return join(cwd, AGGREGATE_STATE_RELATIVE_PATH);
}

function readAggregateFingerprintState(
  statePath: string
): AggregateFingerprintState {
  if (!fs.existsSync(statePath)) {
    return {
      ...DEFAULT_AGGREGATE_FINGERPRINT_STATE,
      entries: {},
    };
  }

  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AggregateFingerprintState>;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.entries !== 'object' ||
      parsed.entries === null
    ) {
      return {
        ...DEFAULT_AGGREGATE_FINGERPRINT_STATE,
        entries: {},
      };
    }
    return {
      version: AGGREGATE_STATE_VERSION,
      entries: Object.fromEntries(
        Object.entries(parsed.entries).filter(
          ([, value]) =>
            typeof value === 'object' &&
            value !== null &&
            typeof (value as any).fingerprint === 'string'
        )
      ) as AggregateFingerprintState['entries'],
    };
  } catch {
    return {
      ...DEFAULT_AGGREGATE_FINGERPRINT_STATE,
      entries: {},
    };
  }
}

function writeAggregateFingerprintState(
  statePath: string,
  state: AggregateFingerprintState
): void {
  fs.mkdirSync(dirname(statePath), { recursive: true });
  const tmpPath = `${statePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, statePath);
}

export function getAggregateBackfillDeploymentKey(
  args: string[],
  cwd = process.cwd(),
  env?: Record<string, string | undefined>
): string {
  if (args.includes('--prod')) {
    return 'prod';
  }

  const deploymentName = readOptionalCliFlagValue(args, '--deployment-name');
  if (deploymentName) {
    return `deployment:${deploymentName}`;
  }

  const previewName = readOptionalCliFlagValue(args, '--preview-name');
  if (previewName) {
    return `preview:${previewName}`;
  }

  const envKey = env ? resolveRemoteConvexDeploymentKey(env) : null;
  if (envKey) {
    return envKey;
  }

  const envFileVars = readConvexTargetEnvFile(args, cwd);
  if (envFileVars) {
    const envFileKey = resolveRemoteConvexDeploymentKey(envFileVars);
    if (envFileKey) {
      return envFileKey;
    }
  }

  return 'local';
}

export function ensureConvexGitignoreEntry(cwd = process.cwd()): void {
  let currentDir = resolve(cwd);
  let gitRoot: string | null = null;
  while (true) {
    if (fs.existsSync(join(currentDir, '.git'))) {
      gitRoot = currentDir;
      break;
    }
    const parent = dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }

  if (!gitRoot) {
    return;
  }

  const gitignorePath = join(gitRoot, '.gitignore');
  const existing = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf8')
    : '';
  const normalized =
    existing.endsWith('\n') || existing.length === 0
      ? existing
      : `${existing}\n`;
  const missingEntries = GITIGNORE_RUNTIME_ENTRIES.filter(
    (entry) =>
      !new RegExp(
        `(^|\\r?\\n)${entry.replace('/', '\\/?')}\\s*(\\r?\\n|$)`,
        'm'
      ).test(existing)
  );

  if (missingEntries.length === 0) {
    return;
  }

  fs.writeFileSync(
    gitignorePath,
    `${normalized}${missingEntries.join('\n')}\n`
  );
}

// Track child processes for cleanup
const processes: any[] = [];

export function trackProcess(process: any) {
  processes.push(process);
}

export function cleanup() {
  for (const proc of processes) {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
  }
}

export type RunDeps = {
  execa: typeof execa;
  runAnalyze: typeof runAnalyze;
  generateMeta: typeof generateMeta;
  getConvexConfig: typeof getConvexConfig;
  pullEnv: typeof pullEnv;
  syncEnv: typeof syncEnv;
  loadCliConfig: typeof loadCliConfig;
  ensureConvexGitignoreEntry: typeof ensureConvexGitignoreEntry;
  promptAdapter: PromptAdapter;
  enableDevSchemaWatch: boolean;
  realConvex: string;
  realConcave?: string;
};

export function resolveCodegenTrimSegments(config: {
  codegen: { trimSegments?: string[] };
}): string[] {
  const configured = config.codegen.trimSegments ?? [];
  const normalized = [
    ...new Set(
      configured
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0)
    ),
  ];
  return normalized.length > 0 ? normalized : ['plugins'];
}

type BackendAdapter = {
  publicName: CliBackend;
  internalName: 'convex' | 'concave-bun';
  command: string;
  argsPrefix: string[];
};

export function resolveConfiguredBackend(params: {
  backendArg?: CliBackend;
  config?: Pick<CliConfig, 'backend'>;
}): CliBackend {
  return params.backendArg ?? params.config?.backend ?? 'convex';
}

function resolveInstalledConcaveCliPath() {
  try {
    const concavePkgPath = require.resolve('@concavejs/cli/package.json');
    const concavePkg = JSON.parse(fs.readFileSync(concavePkgPath, 'utf8')) as {
      bin?: string | Record<string, string>;
    };
    const binRelative =
      typeof concavePkg.bin === 'string'
        ? concavePkg.bin
        : concavePkg.bin?.concave;
    if (!binRelative) {
      throw new Error('Missing concave binary entry.');
    }
    return join(dirname(concavePkgPath), binRelative);
  } catch (error) {
    throw new Error(
      `backend=concave requires @concavejs/cli to be installed. ${(error as Error).message}`
    );
  }
}

function resolveConcaveCliPath(realConcavePath?: string) {
  if (realConcavePath) {
    if (!fs.existsSync(realConcavePath)) {
      throw new Error(
        `backend=concave could not find Concave CLI at ${realConcavePath}.`
      );
    }
    return realConcavePath;
  }
  return resolveInstalledConcaveCliPath();
}

export function createBackendAdapter(params: {
  backend: CliBackend;
  realConvexPath: string;
  realConcavePath?: string;
}): BackendAdapter {
  if (params.backend === 'concave') {
    return {
      publicName: 'concave',
      internalName: 'concave-bun',
      command: 'bun',
      argsPrefix: [resolveConcaveCliPath(params.realConcavePath)],
    };
  }
  return {
    publicName: 'convex',
    internalName: 'convex',
    command: 'node',
    argsPrefix: [params.realConvexPath],
  };
}

function resolveTemplateInitCodegenArgs(
  runtimeAdapter: BackendAdapter,
  template?: string
) {
  if (template && runtimeAdapter.publicName === 'concave') {
    return ['--static'];
  }
  return undefined;
}

export async function runConfiguredCodegen(params: {
  config: ReturnType<typeof loadCliConfig>;
  sharedDir: string;
  debug: boolean;
  generateMetaFn: typeof generateMeta;
  execaFn: typeof execa;
  syncEnvFn?: typeof syncEnv;
  autoSyncLocalAuthEnv?: boolean;
  realConvexPath: string;
  realConcavePath?: string;
  additionalConvexArgs?: string[];
  backend?: CliBackend;
}): Promise<number> {
  const result = await runConfiguredCodegenDetailed({
    ...params,
    stdio: 'pipe',
  });
  if (result.stdout) {
    process.stdout.write(
      result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`
    );
  }
  if (result.stderr) {
    process.stderr.write(
      result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`
    );
  }
  return result.exitCode;
}

export async function runConfiguredCodegenDetailed(params: {
  config: ReturnType<typeof loadCliConfig>;
  sharedDir: string;
  debug: boolean;
  generateMetaFn: typeof generateMeta;
  execaFn: typeof execa;
  syncEnvFn?: typeof syncEnv;
  autoSyncLocalAuthEnv?: boolean;
  realConvexPath: string;
  realConcavePath?: string;
  additionalConvexArgs?: string[];
  backend?: CliBackend;
  env?: Record<string, string | undefined>;
  stdio?: 'inherit' | 'pipe';
  backendAdapter?: BackendAdapter;
  allowLocalBootstrapFallback?: boolean;
}): Promise<CodegenRunResult> {
  const {
    config,
    sharedDir,
    debug,
    generateMetaFn,
    execaFn,
    syncEnvFn = syncEnv,
    autoSyncLocalAuthEnv = true,
    realConvexPath,
    additionalConvexArgs,
    env,
    backend,
    backendAdapter,
    allowLocalBootstrapFallback = true,
    stdio = 'pipe',
  } = params;
  const scope = config.codegen.scope;
  const trimSegments = resolveCodegenTrimSegments(config);
  const convexCodegenArgs = [
    ...config.codegen.args,
    ...(additionalConvexArgs ?? []),
  ];
  const resolvedRuntimeAdapter =
    backendAdapter ??
    createBackendAdapter({
      backend: backend ?? config.backend,
      realConvexPath,
      realConcavePath: params.realConcavePath,
    });
  const targetArgs = extractBackendRunTargetArgs(
    resolvedRuntimeAdapter.publicName,
    convexCodegenArgs
  );
  const localBackendEnv = getLocalBackendEnvVars(
    sharedDir,
    resolvedRuntimeAdapter.publicName
  );
  const shouldAutoSyncLocalAuthEnv =
    autoSyncLocalAuthEnv &&
    resolvedRuntimeAdapter.publicName === 'convex' &&
    getAggregateBackfillDeploymentKey(targetArgs) === 'local';
  const authEnvState = shouldAutoSyncLocalAuthEnv
    ? resolveAuthEnvState({
        cwd: process.cwd(),
        sharedDir,
      })
    : null;

  if (authEnvState?.installed) {
    try {
      await syncEnvFn({
        authSyncMode: 'prepare',
        force: true,
        sharedDir,
        silent: true,
        targetArgs,
      });
    } catch {
      // Cold local apps can still recover through the normal bootstrap retry.
    }
  }

  await withLocalCodegenEnv(
    sharedDir,
    resolvedRuntimeAdapter.publicName,
    async () => {
      await generateMetaFn(sharedDir, {
        debug,
        scope: scope ?? 'all',
        trimSegments,
      });
    }
  );

  const result = await execaFn(
    resolvedRuntimeAdapter.command,
    [...resolvedRuntimeAdapter.argsPrefix, 'codegen', ...convexCodegenArgs],
    {
      stdio,
      cwd: process.cwd(),
      env: createBackendCommandEnv({
        ...localBackendEnv,
        ...env,
      }),
      reject: false,
    }
  );
  if (
    resolvedRuntimeAdapter.publicName === 'convex' &&
    allowLocalBootstrapFallback &&
    result.exitCode !== 0 &&
    LOCAL_BACKEND_NOT_RUNNING_RE.test(
      `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    )
  ) {
    const { functionsDir } = getConvexConfig(sharedDir);
    if (!fs.existsSync(getGeneratedServerStubPath(functionsDir))) {
      writeGeneratedServerStub(functionsDir);
    }

    const targetArgs = extractBackendRunTargetArgs(
      resolvedRuntimeAdapter.publicName,
      convexCodegenArgs
    );
    const bootstrap = await runLocalConvexBootstrapForInit({
      execaFn,
      runtimeAdapter: resolvedRuntimeAdapter,
      args: buildCodegenBootstrapArgs(targetArgs),
      sharedDir,
      env,
    });

    if (bootstrap.exitCode !== 0) {
      try {
        return {
          exitCode: bootstrap.exitCode,
          stdout: bootstrap.stdout,
          stderr: bootstrap.stderr,
        };
      } finally {
        await bootstrap.stop();
      }
    }

    try {
      return await runConfiguredCodegenDetailed({
        ...params,
        allowLocalBootstrapFallback: false,
        backendAdapter: resolvedRuntimeAdapter,
      });
    } finally {
      await bootstrap.stop();
    }
  }
  if (result.exitCode === 0 && authEnvState?.installed) {
    const refreshedAuthEnvState = resolveAuthEnvState({
      cwd: process.cwd(),
      sharedDir,
    });
    if (refreshedAuthEnvState.runtimeReady) {
      try {
        await syncEnvFn({
          authSyncMode: 'complete',
          force: true,
          sharedDir,
          silent: true,
          targetArgs,
        });
      } catch {
        // Let callers that own live bootstrap recover separately.
      }
    }
  }
  return {
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function getGeneratedServerStubPath(functionsDir: string) {
  return join(functionsDir, 'generated', 'server.ts');
}

function writeGeneratedServerStub(functionsDir: string) {
  const stubPath = getGeneratedServerStubPath(functionsDir);
  fs.mkdirSync(dirname(stubPath), { recursive: true });
  fs.writeFileSync(stubPath, INIT_GENERATED_SERVER_STUB_TEMPLATE);
}

function formatInitCodegenFailure(output: string) {
  const trimmed = output.trim();
  return trimmed.length > 0
    ? `Failed to generate a real kitcn runtime during init.\n${trimmed}`
    : 'Failed to generate a real kitcn runtime during init.';
}

function buildInitCodegenBootstrapArgs(targetArgs?: string[]) {
  return ['dev', ...(targetArgs ?? []), '--once', '--typecheck', 'disable'];
}

function buildCodegenBootstrapArgs(targetArgs?: string[]) {
  return ['dev', ...(targetArgs ?? []), '--typecheck', 'disable'];
}

function didConvexInitCreateConfiguration(output: string) {
  return CONVEX_INIT_CREATED_CONFIG_RE.test(output);
}

function isLocalBackendUpgradePrompt(output: string): boolean {
  return output.includes(
    'This deployment is using an older version of the Convex backend. Upgrade now?'
  );
}

export async function runConvexInitIfNeeded(params: {
  execaFn: typeof execa;
  backendAdapter: BackendAdapter;
  env?: Record<string, string | undefined>;
  echoOutput?: boolean;
  targetArgs?: string[];
}): Promise<{
  created: boolean;
  exitCode: number;
  stderr: string;
  stdout: string;
}> {
  if (params.backendAdapter.publicName !== 'convex') {
    return {
      created: false,
      exitCode: 0,
      stdout: '',
      stderr: '',
    };
  }

  const shouldUseLocalDevPreflight =
    getAggregateBackfillDeploymentKey(
      params.targetArgs ?? [],
      process.cwd(),
      params.env
    ) === 'local';
  const runCommand = async (commandArgs: string[]) =>
    normalizeConvexCommandResult(
      await params.execaFn(params.backendAdapter.command, commandArgs, {
        cwd: process.cwd(),
        env: createBackendCommandEnv(params.env),
        reject: false,
        stdio: 'pipe',
      })
    );
  const initCommandArgs = [
    ...params.backendAdapter.argsPrefix,
    'init',
    ...(params.targetArgs ?? []),
  ];
  let result = await runCommand(initCommandArgs);

  if (
    shouldUseLocalDevPreflight &&
    result.exitCode !== 0 &&
    isLocalBackendUpgradePrompt(`${result.stdout}\n${result.stderr}`)
  ) {
    result = await runCommand([
      ...params.backendAdapter.argsPrefix,
      'dev',
      '--local',
      '--once',
      '--skip-push',
      '--local-force-upgrade',
      '--typecheck',
      'disable',
      '--codegen',
      'disable',
      ...(params.targetArgs ?? []),
    ]);
  }

  if (params.echoOutput !== false || result.exitCode !== 0) {
    writeConvexCommandOutput(result);
  }
  return {
    created: didConvexInitCreateConfiguration(
      `${result.stdout}\n${result.stderr}`
    ),
    ...result,
  };
}

function isPersistentExecaProcess(
  value: unknown
): value is PersistentExecaProcess {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PersistentExecaProcess).kill === 'function' &&
    ('stdout' in value || 'stderr' in value)
  );
}

async function stopPersistentBootstrapProcess(
  process: PersistentExecaProcess
): Promise<void> {
  try {
    process.kill?.('SIGTERM');
    await process;
  } catch {
    process.kill?.('SIGKILL');
  }
}

async function runLocalConvexBootstrapForInit(params: {
  execaFn: typeof execa;
  runtimeAdapter: BackendAdapter;
  args: string[];
  sharedDir: string;
  env?: Record<string, string | undefined>;
}): Promise<InitBootstrapResult> {
  const localConvexEnv = getLocalBackendEnvVars(
    params.sharedDir,
    params.runtimeAdapter.publicName
  );
  const bootstrapProcess = params.execaFn(
    params.runtimeAdapter.command,
    [...params.runtimeAdapter.argsPrefix, ...params.args],
    {
      cwd: process.cwd(),
      env: createBackendCommandEnv({
        ...localConvexEnv,
        ...params.env,
      }),
      reject: false,
      stdio: 'pipe',
    }
  );

  if (!isPersistentExecaProcess(bootstrapProcess)) {
    const result = await bootstrapProcess;
    return {
      exitCode: result.exitCode ?? 0,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      stop: async () => {},
    };
  }

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const pushChunk = (chunk: unknown, target: string[]) => {
    target.push(String(chunk));
  };

  bootstrapProcess.stdout?.on('data', (chunk) => {
    pushChunk(chunk, stdoutChunks);
  });
  bootstrapProcess.stderr?.on('data', (chunk) => {
    pushChunk(chunk, stderrChunks);
  });

  const buildResult = (exitCode: number): CodegenRunResult => ({
    exitCode,
    stdout: stdoutChunks.join(''),
    stderr: stderrChunks.join(''),
  });

  const ready = await new Promise<CodegenRunResult>((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: CodegenRunResult) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve(result);
    };

    const checkReady = () => {
      const combined = `${stdoutChunks.join('')}\n${stderrChunks.join('')}`;
      if (INIT_LOCAL_BOOTSTRAP_READY_RE.test(combined)) {
        finish(buildResult(0));
      }
    };

    bootstrapProcess.stdout?.on('data', checkReady);
    bootstrapProcess.stderr?.on('data', checkReady);

    bootstrapProcess.then(
      (result) =>
        finish({
          exitCode: result.exitCode ?? 0,
          stdout: result.stdout ?? stdoutChunks.join(''),
          stderr: result.stderr ?? stderrChunks.join(''),
        }),
      (error) =>
        finish({
          exitCode: 1,
          stdout: stdoutChunks.join(''),
          stderr: `${stderrChunks.join('')}\n${String(error)}`.trim(),
        })
    );

    timeoutId = setTimeout(() => {
      finish({
        exitCode: 1,
        stdout: stdoutChunks.join(''),
        stderr:
          `${stderrChunks.join('')}\nTimed out waiting for local Convex bootstrap.`.trim(),
      });
    }, INIT_LOCAL_BOOTSTRAP_TIMEOUT_MS);
  });

  return {
    ...ready,
    stop: async () => {
      await stopPersistentBootstrapProcess(bootstrapProcess);
    },
  };
}

async function runInitializationCodegen(params: {
  allowCodegenBootstrapFallback: boolean;
  config: ReturnType<typeof loadCliConfig>;
  backend: CliBackend;
  yes: boolean;
  sharedDir: string;
  debug: boolean;
  generateMetaFn: typeof generateMeta;
  syncEnvFn: typeof syncEnv;
  execaFn: typeof execa;
  realConvexPath: string;
  realConcavePath?: string;
  functionsDir: string;
  template?: string;
  targetArgs?: string[];
}): Promise<{
  codegen: InitCodegenStatus;
  convexBootstrap: InitConvexBootstrapStatus;
  localBootstrapUsed: boolean;
}> {
  const runtimeAdapter = createBackendAdapter({
    backend: params.backend,
    realConvexPath: params.realConvexPath,
    realConcavePath: params.realConcavePath,
  });
  const additionalCodegenArgs = resolveTemplateInitCodegenArgs(
    runtimeAdapter,
    params.template
  );
  if (runtimeAdapter.publicName === 'convex') {
    const initResult = await runConvexInitIfNeeded({
      execaFn: params.execaFn,
      backendAdapter: runtimeAdapter,
      targetArgs: params.targetArgs,
    });
    if (initResult.exitCode !== 0) {
      throw new Error(
        `Failed to configure Convex project via \`convex init\`.\n${`${initResult.stdout}\n${initResult.stderr}`.trim()}`
      );
    }

    const codegen = await runConfiguredCodegenDetailed({
      config: params.config,
      sharedDir: params.sharedDir,
      debug: params.debug,
      generateMetaFn: params.generateMetaFn,
      execaFn: params.execaFn,
      syncEnvFn: params.syncEnvFn,
      autoSyncLocalAuthEnv: false,
      realConvexPath: params.realConvexPath,
      realConcavePath: params.realConcavePath,
      additionalConvexArgs: additionalCodegenArgs,
      backend: params.backend,
      backendAdapter: runtimeAdapter,
      allowLocalBootstrapFallback: false,
    });
    if (codegen.exitCode !== 0) {
      const generatedServerPath = getGeneratedServerStubPath(
        params.functionsDir
      );
      if (!fs.existsSync(generatedServerPath)) {
        writeGeneratedServerStub(params.functionsDir);
      }
      if (!params.allowCodegenBootstrapFallback) {
        return {
          codegen: 'stubbed',
          convexBootstrap: initResult.created ? 'created' : 'existing',
          localBootstrapUsed: false,
        };
      }
      await params.syncEnvFn({
        authSyncMode: 'prepare',
        force: true,
        sharedDir: params.sharedDir,
        targetArgs: params.targetArgs,
      });
      const bootstrap = await runLocalConvexBootstrapForInit({
        execaFn: params.execaFn,
        runtimeAdapter,
        args: buildInitCodegenBootstrapArgs(params.targetArgs),
        sharedDir: params.sharedDir,
      });
      try {
        if (bootstrap.exitCode !== 0) {
          throw new Error(
            formatInitCodegenFailure(
              `${codegen.stdout}\n${codegen.stderr}\n${bootstrap.stdout}\n${bootstrap.stderr}`
            )
          );
        }
        await withLocalCodegenEnv(
          params.sharedDir,
          runtimeAdapter.publicName,
          async () => {
            await params.generateMetaFn(params.sharedDir, {
              debug: params.debug,
              scope: params.config.codegen.scope ?? 'all',
              trimSegments: resolveCodegenTrimSegments(params.config),
            });
          }
        );
        await params.syncEnvFn({
          authSyncMode: 'complete',
          force: true,
          sharedDir: params.sharedDir,
          targetArgs: params.targetArgs,
        });
      } finally {
        await bootstrap.stop();
      }
      return {
        codegen: 'generated',
        convexBootstrap: initResult.created ? 'created' : 'existing',
        localBootstrapUsed: true,
      };
    }
    return {
      codegen: 'generated',
      convexBootstrap: initResult.created ? 'created' : 'existing',
      localBootstrapUsed: false,
    };
  }

  const initial = await runConfiguredCodegenDetailed({
    config: params.config,
    sharedDir: params.sharedDir,
    debug: params.debug,
    generateMetaFn: params.generateMetaFn,
    execaFn: params.execaFn,
    syncEnvFn: params.syncEnvFn,
    autoSyncLocalAuthEnv: false,
    realConvexPath: params.realConvexPath,
    realConcavePath: params.realConcavePath,
    additionalConvexArgs: additionalCodegenArgs,
    backend: params.backend,
    backendAdapter: runtimeAdapter,
  });
  if (initial.exitCode === 0) {
    return {
      codegen: 'generated',
      convexBootstrap: 'existing',
      localBootstrapUsed: false,
    };
  }

  const anonymousBootstrap = await runLocalConvexBootstrapForInit({
    execaFn: params.execaFn,
    runtimeAdapter,
    args: ['dev', '--bun'],
    sharedDir: params.sharedDir,
  });
  if (anonymousBootstrap.exitCode !== 0) {
    await anonymousBootstrap.stop();
    if (params.template) {
      throw new Error(
        formatInitCodegenFailure(
          `${anonymousBootstrap.stdout}\n${anonymousBootstrap.stderr}`
        )
      );
    }
    writeGeneratedServerStub(params.functionsDir);
    return {
      codegen: 'stubbed',
      convexBootstrap: 'missing',
      localBootstrapUsed: true,
    };
  }

  try {
    const retry = await runConfiguredCodegenDetailed({
      config: params.config,
      sharedDir: params.sharedDir,
      debug: params.debug,
      generateMetaFn: params.generateMetaFn,
      execaFn: params.execaFn,
      syncEnvFn: params.syncEnvFn,
      autoSyncLocalAuthEnv: false,
      realConvexPath: params.realConvexPath,
      realConcavePath: params.realConcavePath,
      additionalConvexArgs: additionalCodegenArgs,
      backend: params.backend,
      backendAdapter: runtimeAdapter,
    });
    if (retry.exitCode === 0) {
      return {
        codegen: 'generated',
        convexBootstrap: 'created',
        localBootstrapUsed: true,
      };
    }

    throw new Error(
      formatInitCodegenFailure(`${retry.stdout}\n${retry.stderr}`.trim())
    );
  } finally {
    await anonymousBootstrap.stop();
  }
}

export async function runAfterScaffoldScript(params: {
  script: string;
  execaFn: typeof execa;
}): Promise<number> {
  const script = params.script.trim();
  if (script.length === 0) {
    return 0;
  }

  const result = await params.execaFn(script, [], {
    shell: true,
    stdio: 'inherit',
    cwd: process.cwd(),
    env: createCommandEnv(),
    reject: false,
  });
  return result.exitCode ?? 0;
}

type BackfillCliOverrides = {
  enabled?: BackfillEnabled;
  wait?: boolean;
  batchSize?: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
  strict?: boolean;
};

type MigrationCliOverrides = {
  enabled?: BackfillEnabled;
  wait?: boolean;
  batchSize?: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
  strict?: boolean;
  allowDrift?: boolean;
};

type ResetCliOptions = {
  confirmed: boolean;
  beforeHook?: string;
  afterHook?: string;
  remainingArgs: string[];
};

const VALID_BACKFILL_ENABLED = new Set<BackfillEnabled>(['auto', 'on', 'off']);
const CONVEX_DEV_PRE_RUN_CONFLICT_FLAGS = [
  '--run',
  '--start',
  '--run-sh',
  '--run-component',
] as const;
const REMOVED_DEV_PRE_RUN_MESSAGE =
  '`--pre-run` was removed. Use dev.preRun in kitcn.json.';

function parsePositiveIntegerArg(flag: string, raw: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} expects a positive integer.`);
  }
  return parsed;
}

function readFlagValue(
  args: string[],
  index: number,
  flag: string
): { value: string; nextIndex: number } {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return { value, nextIndex: index + 1 };
}

function isRemovedDevPreRunFlag(arg: string): boolean {
  return arg === '--pre-run' || arg.startsWith('--pre-run=');
}

export function assertNoRemovedDevPreRunFlag(args: string[]): void {
  if (args.some((arg) => isRemovedDevPreRunFlag(arg))) {
    throw new Error(REMOVED_DEV_PRE_RUN_MESSAGE);
  }
}

export function isConvexDevPreRunConflictFlag(arg: string): boolean {
  return CONVEX_DEV_PRE_RUN_CONFLICT_FLAGS.some(
    (flag) => arg === flag || arg.startsWith(`${flag}=`)
  );
}

function applyConvexDevPreRunArgs(
  args: string[],
  preRunFunction?: string
): string[] {
  if (!preRunFunction) {
    return args;
  }

  return ['--run', preRunFunction, ...args];
}

export function extractBackfillCliOptions(args: string[]): {
  remainingArgs: string[];
  overrides: BackfillCliOverrides;
} {
  const remainingArgs: string[] = [];
  const overrides: BackfillCliOverrides = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--force') {
      continue;
    }
    if (arg === '--backfill') {
      const { value, nextIndex } = readFlagValue(args, i, '--backfill');
      if (!VALID_BACKFILL_ENABLED.has(value as BackfillEnabled)) {
        throw new Error('Invalid --backfill value. Expected auto, on, or off.');
      }
      overrides.enabled = value as BackfillEnabled;
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--backfill=')) {
      const value = arg.slice('--backfill='.length);
      if (!VALID_BACKFILL_ENABLED.has(value as BackfillEnabled)) {
        throw new Error('Invalid --backfill value. Expected auto, on, or off.');
      }
      overrides.enabled = value as BackfillEnabled;
      continue;
    }
    if (arg === '--backfill-mode') {
      readFlagValue(args, i, '--backfill-mode');
      throw new Error(
        '`--backfill-mode` was removed. Use `kitcn aggregate rebuild`.'
      );
    }
    if (arg.startsWith('--backfill-mode=')) {
      throw new Error(
        '`--backfill-mode` was removed. Use `kitcn aggregate rebuild`.'
      );
    }
    if (arg === '--backfill-wait') {
      overrides.wait = true;
      continue;
    }
    if (arg === '--no-backfill-wait') {
      overrides.wait = false;
      continue;
    }
    if (arg === '--backfill-strict') {
      overrides.strict = true;
      continue;
    }
    if (arg === '--no-backfill-strict') {
      overrides.strict = false;
      continue;
    }
    if (arg === '--backfill-batch-size') {
      const { value, nextIndex } = readFlagValue(
        args,
        i,
        '--backfill-batch-size'
      );
      overrides.batchSize = parsePositiveIntegerArg(
        '--backfill-batch-size',
        value
      );
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--backfill-batch-size=')) {
      overrides.batchSize = parsePositiveIntegerArg(
        '--backfill-batch-size',
        arg.slice('--backfill-batch-size='.length)
      );
      continue;
    }
    if (arg === '--backfill-timeout-ms') {
      const { value, nextIndex } = readFlagValue(
        args,
        i,
        '--backfill-timeout-ms'
      );
      overrides.timeoutMs = parsePositiveIntegerArg(
        '--backfill-timeout-ms',
        value
      );
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--backfill-timeout-ms=')) {
      overrides.timeoutMs = parsePositiveIntegerArg(
        '--backfill-timeout-ms',
        arg.slice('--backfill-timeout-ms='.length)
      );
      continue;
    }
    if (arg === '--backfill-poll-ms') {
      const { value, nextIndex } = readFlagValue(args, i, '--backfill-poll-ms');
      overrides.pollIntervalMs = parsePositiveIntegerArg(
        '--backfill-poll-ms',
        value
      );
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--backfill-poll-ms=')) {
      overrides.pollIntervalMs = parsePositiveIntegerArg(
        '--backfill-poll-ms',
        arg.slice('--backfill-poll-ms='.length)
      );
      continue;
    }
    remainingArgs.push(arg);
  }

  return {
    remainingArgs,
    overrides,
  };
}

export function extractMigrationCliOptions(args: string[]): {
  remainingArgs: string[];
  overrides: MigrationCliOverrides;
} {
  const remainingArgs: string[] = [];
  const overrides: MigrationCliOverrides = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--migrations') {
      const { value, nextIndex } = readFlagValue(args, i, '--migrations');
      if (!VALID_BACKFILL_ENABLED.has(value as BackfillEnabled)) {
        throw new Error(
          'Invalid --migrations value. Expected auto, on, or off.'
        );
      }
      overrides.enabled = value as BackfillEnabled;
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--migrations=')) {
      const value = arg.slice('--migrations='.length);
      if (!VALID_BACKFILL_ENABLED.has(value as BackfillEnabled)) {
        throw new Error(
          'Invalid --migrations value. Expected auto, on, or off.'
        );
      }
      overrides.enabled = value as BackfillEnabled;
      continue;
    }
    if (arg === '--migrations-wait') {
      overrides.wait = true;
      continue;
    }
    if (arg === '--no-migrations-wait') {
      overrides.wait = false;
      continue;
    }
    if (arg === '--migrations-strict') {
      overrides.strict = true;
      continue;
    }
    if (arg === '--no-migrations-strict') {
      overrides.strict = false;
      continue;
    }
    if (arg === '--migrations-allow-drift') {
      overrides.allowDrift = true;
      continue;
    }
    if (arg === '--no-migrations-allow-drift') {
      overrides.allowDrift = false;
      continue;
    }
    if (arg === '--migrations-batch-size') {
      const { value, nextIndex } = readFlagValue(
        args,
        i,
        '--migrations-batch-size'
      );
      overrides.batchSize = parsePositiveIntegerArg(
        '--migrations-batch-size',
        value
      );
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--migrations-batch-size=')) {
      overrides.batchSize = parsePositiveIntegerArg(
        '--migrations-batch-size',
        arg.slice('--migrations-batch-size='.length)
      );
      continue;
    }
    if (arg === '--migrations-timeout-ms') {
      const { value, nextIndex } = readFlagValue(
        args,
        i,
        '--migrations-timeout-ms'
      );
      overrides.timeoutMs = parsePositiveIntegerArg(
        '--migrations-timeout-ms',
        value
      );
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--migrations-timeout-ms=')) {
      overrides.timeoutMs = parsePositiveIntegerArg(
        '--migrations-timeout-ms',
        arg.slice('--migrations-timeout-ms='.length)
      );
      continue;
    }
    if (arg === '--migrations-poll-ms') {
      const { value, nextIndex } = readFlagValue(
        args,
        i,
        '--migrations-poll-ms'
      );
      overrides.pollIntervalMs = parsePositiveIntegerArg(
        '--migrations-poll-ms',
        value
      );
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--migrations-poll-ms=')) {
      overrides.pollIntervalMs = parsePositiveIntegerArg(
        '--migrations-poll-ms',
        arg.slice('--migrations-poll-ms='.length)
      );
      continue;
    }

    remainingArgs.push(arg);
  }

  return {
    remainingArgs,
    overrides,
  };
}

export function extractResetCliOptions(args: string[]): ResetCliOptions {
  const remainingArgs: string[] = [];
  let confirmed = false;
  let beforeHook: string | undefined;
  let afterHook: string | undefined;

  const isBackfillFlag = (arg: string) =>
    arg === '--backfill' ||
    arg.startsWith('--backfill=') ||
    arg.startsWith('--backfill-') ||
    arg.startsWith('--no-backfill-');

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (isBackfillFlag(arg)) {
      throw new Error(
        '`kitcn reset` does not accept backfill flags. It always runs aggregateBackfill in resume mode.'
      );
    }
    if (arg === '--yes') {
      confirmed = true;
      continue;
    }
    if (arg === '--before') {
      const { value, nextIndex } = readFlagValue(args, i, '--before');
      beforeHook = value;
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--before=')) {
      const value = arg.slice('--before='.length);
      if (!value) {
        throw new Error('Missing value for --before.');
      }
      beforeHook = value;
      continue;
    }
    if (arg === '--after') {
      const { value, nextIndex } = readFlagValue(args, i, '--after');
      afterHook = value;
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--after=')) {
      const value = arg.slice('--after='.length);
      if (!value) {
        throw new Error('Missing value for --after.');
      }
      afterHook = value;
      continue;
    }
    remainingArgs.push(arg);
  }

  return {
    confirmed,
    beforeHook,
    afterHook,
    remainingArgs,
  };
}

export function resolveBackfillConfig(
  base: AggregateBackfillConfig | undefined,
  overrides: BackfillCliOverrides
): AggregateBackfillConfig {
  const fallback: AggregateBackfillConfig = {
    enabled: 'auto',
    wait: true,
    batchSize: 1000,
    timeoutMs: 900_000,
    pollIntervalMs: 1000,
    strict: false,
  };
  const resolvedBase = base ?? fallback;
  return {
    ...resolvedBase,
    enabled: overrides.enabled ?? resolvedBase.enabled,
    wait: overrides.wait ?? resolvedBase.wait,
    batchSize: overrides.batchSize ?? resolvedBase.batchSize,
    timeoutMs: overrides.timeoutMs ?? resolvedBase.timeoutMs,
    pollIntervalMs: overrides.pollIntervalMs ?? resolvedBase.pollIntervalMs,
    strict: overrides.strict ?? resolvedBase.strict,
  };
}

export function resolveMigrationConfig(
  base: MigrationConfig | undefined,
  overrides: MigrationCliOverrides
): MigrationConfig {
  const fallback: MigrationConfig = {
    enabled: 'auto',
    wait: true,
    batchSize: 256,
    timeoutMs: 900_000,
    pollIntervalMs: 1000,
    strict: false,
    allowDrift: true,
  };
  const resolvedBase = base ?? fallback;
  return {
    ...resolvedBase,
    enabled: overrides.enabled ?? resolvedBase.enabled,
    wait: overrides.wait ?? resolvedBase.wait,
    batchSize: overrides.batchSize ?? resolvedBase.batchSize,
    timeoutMs: overrides.timeoutMs ?? resolvedBase.timeoutMs,
    pollIntervalMs: overrides.pollIntervalMs ?? resolvedBase.pollIntervalMs,
    strict: overrides.strict ?? resolvedBase.strict,
    allowDrift: overrides.allowDrift ?? resolvedBase.allowDrift,
  };
}

export function extractConvexRunTargetArgs(args: string[]): string[] {
  const deploymentArgs: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--prod') {
      deploymentArgs.push(arg);
      continue;
    }
    if (
      arg === '--preview-name' ||
      arg === '--deployment-name' ||
      arg === '--env-file' ||
      arg === '--component'
    ) {
      const value = args[i + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}.`);
      }
      deploymentArgs.push(arg, value);
      i += 1;
      continue;
    }
    if (
      arg.startsWith('--preview-name=') ||
      arg.startsWith('--deployment-name=') ||
      arg.startsWith('--env-file=') ||
      arg.startsWith('--component=')
    ) {
      deploymentArgs.push(arg);
    }
  }
  return deploymentArgs;
}

export function extractConcaveRunTargetArgs(args: string[]): string[] {
  const targetArgs: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--url' || arg === '--port' || arg === '--component') {
      const value = args[i + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}.`);
      }
      targetArgs.push(arg, value);
      i += 1;
      continue;
    }
    if (
      arg.startsWith('--url=') ||
      arg.startsWith('--port=') ||
      arg.startsWith('--component=')
    ) {
      targetArgs.push(arg);
    }
  }
  return targetArgs;
}

export function extractBackendRunTargetArgs(
  backend: CliBackend,
  args: string[]
): string[] {
  return backend === 'concave'
    ? extractConcaveRunTargetArgs(args)
    : extractConvexRunTargetArgs(args);
}

function isMissingBackfillFunctionOutput(output: string): boolean {
  return MISSING_BACKFILL_FUNCTION_RE.test(output);
}

export function parseBackendRunJson<T>(stdout: string): T {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return [] as T;
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const trailingBlockStart = Math.max(
      trimmed.lastIndexOf('\n{'),
      trimmed.lastIndexOf('\n[')
    );
    if (trailingBlockStart >= 0) {
      try {
        return JSON.parse(trimmed.slice(trailingBlockStart + 1)) as T;
      } catch {}
    }
    const lines = trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      try {
        return JSON.parse(line) as T;
      } catch {}
    }
  }
  throw new Error(
    `Failed to parse backend run output as JSON.\nOutput:\n${stdout.trim()}`
  );
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
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

export async function runBackendFunction(
  execaFn: typeof execa,
  backendAdapter: BackendAdapter,
  functionName: string,
  args: Record<string, unknown>,
  targetArgs: string[],
  options?: {
    echoOutput?: boolean;
    env?: Record<string, string | undefined>;
  }
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = await execaFn(
    backendAdapter.command,
    [
      ...backendAdapter.argsPrefix,
      'run',
      ...targetArgs,
      functionName,
      JSON.stringify(args),
    ],
    {
      cwd: process.cwd(),
      env: createBackendCommandEnv(options?.env),
      reject: false,
      stdio: 'pipe',
    }
  );
  const stdout =
    typeof (result as any).stdout === 'string' ? (result as any).stdout : '';
  const stderr =
    typeof (result as any).stderr === 'string' ? (result as any).stderr : '';
  if (options?.echoOutput !== false) {
    if (stdout) {
      process.stdout.write(stdout.endsWith('\n') ? stdout : `${stdout}\n`);
    }
    if (stderr) {
      process.stderr.write(stderr.endsWith('\n') ? stderr : `${stderr}\n`);
    }
  }
  return {
    exitCode: result.exitCode ?? 1,
    stdout,
    stderr,
  };
}

export async function runAggregateBackfillFlow(params: {
  execaFn: typeof execa;
  backendAdapter: BackendAdapter;
  backfillConfig: AggregateBackfillConfig;
  mode: 'resume' | 'rebuild';
  targetArgs: string[];
  env?: Record<string, string | undefined>;
  signal?: AbortSignal;
  context: 'deploy' | 'dev' | 'aggregate';
}): Promise<number> {
  const {
    execaFn,
    backendAdapter,
    backfillConfig,
    mode,
    targetArgs,
    env,
    signal,
    context,
  } = params;
  if (signal?.aborted) {
    return 0;
  }

  if (backfillConfig.enabled === 'off') {
    return 0;
  }

  const kickoff = await runBackendFunction(
    execaFn,
    backendAdapter,
    'generated/server:aggregateBackfill',
    {
      mode,
      batchSize: backfillConfig.batchSize,
    },
    targetArgs,
    {
      echoOutput: false,
      env,
    }
  );

  if (kickoff.exitCode !== 0) {
    const combinedOutput = `${kickoff.stdout}\n${kickoff.stderr}`;
    if (
      backfillConfig.enabled === 'auto' &&
      isMissingBackfillFunctionOutput(combinedOutput)
    ) {
      if (context === 'deploy') {
        logger.info(
          'ℹ️  aggregateBackfill not found in this deployment; skipping post-deploy backfill (auto mode).'
        );
      }
      return 0;
    }
    return kickoff.exitCode;
  }

  type KickoffResult = {
    targets?: number;
    needsRebuild?: number;
    scheduled?: number;
    skippedReady?: number;
    pruned?: number;
    mode?: string;
  };
  const kickoffPayload = parseBackendRunJson<KickoffResult | unknown[]>(
    kickoff.stdout
  );
  const needsRebuild =
    typeof kickoffPayload === 'object' &&
    kickoffPayload !== null &&
    !Array.isArray(kickoffPayload) &&
    typeof kickoffPayload.needsRebuild === 'number'
      ? kickoffPayload.needsRebuild
      : 0;
  const scheduled =
    typeof kickoffPayload === 'object' &&
    kickoffPayload !== null &&
    !Array.isArray(kickoffPayload) &&
    typeof kickoffPayload.scheduled === 'number'
      ? kickoffPayload.scheduled
      : 0;
  const targets =
    typeof kickoffPayload === 'object' &&
    kickoffPayload !== null &&
    !Array.isArray(kickoffPayload) &&
    typeof kickoffPayload.targets === 'number'
      ? kickoffPayload.targets
      : 0;
  const pruned =
    typeof kickoffPayload === 'object' &&
    kickoffPayload !== null &&
    !Array.isArray(kickoffPayload) &&
    typeof kickoffPayload.pruned === 'number'
      ? kickoffPayload.pruned
      : 0;
  if (pruned > 0) {
    logger.info(`aggregateBackfill pruned ${pruned} removed indexes`);
  }
  if (mode === 'resume' && needsRebuild > 0) {
    const message = `Aggregate backfill found ${needsRebuild} index definitions that require rebuild. Run \`kitcn aggregate rebuild\` for this deployment.`;
    if (backfillConfig.strict) {
      logger.error(message);
      return 1;
    }
    logger.warn(message);
  } else if (scheduled > 0 && context !== 'dev') {
    logger.info(
      `ℹ️  aggregateBackfill scheduled ${scheduled}/${targets} target indexes`
    );
  }

  if (!backfillConfig.wait || signal?.aborted) {
    return 0;
  }

  const deadline = Date.now() + backfillConfig.timeoutMs;
  let lastProgress = '';
  while (!signal?.aborted) {
    const statusResult = await runBackendFunction(
      execaFn,
      backendAdapter,
      'generated/server:aggregateBackfillStatus',
      {},
      targetArgs,
      {
        echoOutput: false,
        env,
      }
    );
    if (statusResult.exitCode !== 0) {
      return statusResult.exitCode;
    }

    type BackfillStatusEntry = {
      status: string;
      tableName: string;
      indexName: string;
      lastError?: string | null;
    };
    const statuses = parseBackendRunJson<BackfillStatusEntry[]>(
      statusResult.stdout
    );
    const failed = statuses.find((entry) => Boolean(entry.lastError));
    if (failed) {
      logger.error(
        `❌ Aggregate backfill failed for ${failed.tableName}.${failed.indexName}: ${failed.lastError}`
      );
      return backfillConfig.strict ? 1 : 0;
    }

    const total = statuses.length;
    const ready = statuses.filter((entry) => entry.status === 'READY').length;
    const progress = `${ready}/${total}`;
    if (context !== 'dev' && progress !== lastProgress) {
      lastProgress = progress;
      if (total > 0) {
        logger.info(`aggregateBackfill progress ${ready}/${total} READY`);
      }
    }

    if (total === 0 || ready === total) {
      return 0;
    }
    if (Date.now() > deadline) {
      const timeoutMessage = `Aggregate backfill timed out after ${backfillConfig.timeoutMs}ms (${ready}/${total} READY).`;
      if (backfillConfig.strict) {
        logger.error(timeoutMessage);
        return 1;
      }
      logger.warn(timeoutMessage);
      return 0;
    }
    await sleep(backfillConfig.pollIntervalMs, signal);
  }

  return 0;
}

export async function runAggregatePruneFlow(params: {
  execaFn: typeof execa;
  backendAdapter: BackendAdapter;
  targetArgs: string[];
}): Promise<number> {
  const { execaFn, backendAdapter, targetArgs } = params;
  const result = await runBackendFunction(
    execaFn,
    backendAdapter,
    'generated/server:aggregateBackfill',
    {
      mode: 'prune',
    },
    targetArgs,
    {
      echoOutput: false,
    }
  );

  if (result.exitCode !== 0) {
    return result.exitCode;
  }

  type PruneResult = {
    pruned?: number;
  };
  const payload = parseBackendRunJson<PruneResult | unknown[]>(result.stdout);
  const pruned =
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    typeof payload.pruned === 'number'
      ? payload.pruned
      : 0;

  if (pruned > 0) {
    logger.info(`aggregateBackfill pruned ${pruned} removed indexes`);
  } else {
    logger.info('aggregateBackfill prune no-op');
  }

  return 0;
}

function slugifyMigrationName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function createMigrationTimestamp(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hour = String(now.getUTCHours()).padStart(2, '0');
  const minute = String(now.getUTCMinutes()).padStart(2, '0');
  const second = String(now.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}_${hour}${minute}${second}`;
}

export function extractMigrationDownOptions(args: string[]): {
  remainingArgs: string[];
  steps?: number;
  to?: string;
} {
  const remainingArgs: string[] = [];
  let steps: number | undefined;
  let to: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--steps') {
      const { value, nextIndex } = readFlagValue(args, i, '--steps');
      steps = parsePositiveIntegerArg('--steps', value);
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--steps=')) {
      steps = parsePositiveIntegerArg('--steps', arg.slice('--steps='.length));
      continue;
    }
    if (arg === '--to') {
      const { value, nextIndex } = readFlagValue(args, i, '--to');
      to = value;
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--to=')) {
      const value = arg.slice('--to='.length);
      if (!value) {
        throw new Error('Missing value for --to.');
      }
      to = value;
      continue;
    }
    remainingArgs.push(arg);
  }

  if (steps !== undefined && to !== undefined) {
    throw new Error('Use either --steps or --to, not both.');
  }

  return {
    remainingArgs,
    steps,
    to,
  };
}

function renderMigrationManifest(ids: string[]): string {
  const sorted = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
  const importLines = sorted.map(
    (id, index) => `import { migration as migration_${index} } from './${id}';`
  );
  const entryLines = sorted.map((_, index) => `  migration_${index},`);

  return `// biome-ignore-all format: generated
// This file is auto-generated by kitcn migrate create.
// Do not edit manually.

import { defineMigrationSet } from 'kitcn/orm';
${importLines.join('\n')}

export const migrations = defineMigrationSet([
${entryLines.join('\n')}
]);
`;
}

export async function runMigrationCreate(params: {
  migrationName: string;
  functionsDir: string;
}): Promise<void> {
  const { migrationName, functionsDir } = params;
  const normalizedName = slugifyMigrationName(migrationName);
  if (!normalizedName) {
    throw new Error(
      'Migration name must include at least one letter or digit.'
    );
  }

  const timestamp = createMigrationTimestamp();
  const migrationId = `${timestamp}_${normalizedName}`;
  const migrationsDir = join(functionsDir, 'migrations');
  const migrationFile = join(migrationsDir, `${migrationId}.ts`);
  const manifestFile = join(migrationsDir, 'manifest.ts');

  fs.mkdirSync(migrationsDir, { recursive: true });
  if (fs.existsSync(migrationFile)) {
    throw new Error(
      `Migration file already exists for '${migrationId}'. Wait one second and retry.`
    );
  }

  const migrationSource = `import { defineMigration } from '../generated/migrations.gen';

export const migration = defineMigration({
  id: '${migrationId}',
  description: '${migrationName.replaceAll("'", "\\'")}',
  up: {
    table: 'replace_with_table_name',
    migrateOne: async () => {
      // TODO: implement migration logic.
    },
  },
  down: {
    table: 'replace_with_table_name',
    migrateOne: async () => {
      // TODO: implement rollback logic.
    },
  },
});
`;
  fs.writeFileSync(migrationFile, migrationSource);

  const existingMigrationIds = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => file.replace(TS_EXTENSION_RE, ''))
    .filter((id) => id !== 'manifest')
    .sort((a, b) => a.localeCompare(b));
  fs.writeFileSync(manifestFile, renderMigrationManifest(existingMigrationIds));

  logger.info(`created migration ${migrationId}`);
  logger.info(`file: ${migrationFile}`);
  logger.info(`manifest: ${manifestFile}`);
}

export async function runMigrationFlow(params: {
  execaFn: typeof execa;
  backendAdapter: BackendAdapter;
  migrationConfig: MigrationConfig;
  targetArgs: string[];
  env?: Record<string, string | undefined>;
  signal?: AbortSignal;
  context: 'deploy' | 'dev' | 'migration';
  direction: 'up' | 'down';
  steps?: number;
  to?: string;
}): Promise<number> {
  const {
    execaFn,
    backendAdapter,
    migrationConfig,
    targetArgs,
    env,
    signal,
    context,
    direction,
    steps,
    to,
  } = params;
  if (signal?.aborted || migrationConfig.enabled === 'off') {
    return 0;
  }

  const kickoff = await runBackendFunction(
    execaFn,
    backendAdapter,
    'generated/server:migrationRun',
    {
      direction,
      batchSize: migrationConfig.batchSize,
      allowDrift: migrationConfig.allowDrift,
      ...(steps !== undefined ? { steps } : {}),
      ...(to !== undefined ? { to } : {}),
    },
    targetArgs,
    {
      echoOutput: false,
      env,
    }
  );

  if (kickoff.exitCode !== 0) {
    const combinedOutput = `${kickoff.stdout}\n${kickoff.stderr}`;
    if (
      migrationConfig.enabled === 'auto' &&
      isMissingBackfillFunctionOutput(combinedOutput)
    ) {
      if (context === 'deploy') {
        logger.info(
          'ℹ️  migration runtime not found in this deployment; skipping (auto mode).'
        );
      }
      return 0;
    }
    return kickoff.exitCode;
  }

  type KickoffPayload = {
    status?: string;
    runId?: string;
    drift?: Array<{ message?: string }>;
    plan?: string[];
  };
  const payload = parseBackendRunJson<KickoffPayload | unknown[]>(
    kickoff.stdout
  );
  const kickoffStatus =
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    typeof payload.status === 'string'
      ? payload.status
      : 'running';

  const driftMessages =
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    Array.isArray(payload.drift)
      ? payload.drift
          .map((entry) => entry?.message)
          .filter((entry): entry is string => typeof entry === 'string')
      : [];

  if (kickoffStatus === 'drift_blocked') {
    const message =
      driftMessages[0] ??
      'Migration drift detected and blocked by current policy.';
    if (migrationConfig.strict) {
      logger.error(message);
      return 1;
    }
    logger.warn(message);
    return 0;
  }
  if (kickoffStatus === 'noop') {
    const noopMessage =
      direction === 'down'
        ? 'No applied migrations to roll back.'
        : 'No pending migrations to apply.';
    if (context !== 'dev') {
      logger.info(noopMessage);
    }
    return 0;
  }
  if (kickoffStatus === 'dry_run') {
    logger.info('migration dry run completed (no writes committed).');
    return 0;
  }

  const runId =
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    typeof payload.runId === 'string'
      ? payload.runId
      : undefined;

  if (!migrationConfig.wait || signal?.aborted || !runId) {
    return 0;
  }

  const deadline = Date.now() + migrationConfig.timeoutMs;
  let lastStatusLine = '';
  while (!signal?.aborted) {
    const statusResult = await runBackendFunction(
      execaFn,
      backendAdapter,
      'generated/server:migrationStatus',
      {
        runId,
      },
      targetArgs,
      {
        echoOutput: false,
        env,
      }
    );
    if (statusResult.exitCode !== 0) {
      return statusResult.exitCode;
    }

    type StatusPayload = {
      activeRun?: { status?: string } | null;
      runs?: Array<{
        status?: string;
        currentIndex?: number;
        migrationIds?: string[];
      }>;
    };
    const statusPayload = parseBackendRunJson<StatusPayload | unknown[]>(
      statusResult.stdout
    );
    const runStatus =
      typeof statusPayload === 'object' &&
      statusPayload !== null &&
      !Array.isArray(statusPayload)
        ? (statusPayload.activeRun?.status ??
          statusPayload.runs?.[0]?.status ??
          'unknown')
        : 'unknown';

    const currentIndex =
      typeof statusPayload === 'object' &&
      statusPayload !== null &&
      !Array.isArray(statusPayload) &&
      typeof statusPayload.runs?.[0]?.currentIndex === 'number'
        ? statusPayload.runs[0].currentIndex
        : 0;
    const total =
      typeof statusPayload === 'object' &&
      statusPayload !== null &&
      !Array.isArray(statusPayload) &&
      Array.isArray(statusPayload.runs?.[0]?.migrationIds)
        ? (statusPayload.runs?.[0]?.migrationIds?.length ?? 0)
        : 0;
    const statusLine = `${runStatus}:${currentIndex}/${total}`;
    if (statusLine !== lastStatusLine && total > 0) {
      lastStatusLine = statusLine;
      logger.info(`migration ${runStatus} ${currentIndex}/${total}`);
    }

    if (runStatus === 'completed' || runStatus === 'noop') {
      return 0;
    }
    if (runStatus === 'failed' || runStatus === 'canceled') {
      const message = `Migrations ${runStatus} for run ${runId}.`;
      if (migrationConfig.strict) {
        logger.error(message);
        return 1;
      }
      logger.warn(message);
      return 0;
    }

    if (Date.now() > deadline) {
      const timeoutMessage = `Migrations timed out after ${migrationConfig.timeoutMs}ms.`;
      if (migrationConfig.strict) {
        logger.error(timeoutMessage);
        return 1;
      }
      logger.warn(timeoutMessage);
      return 0;
    }

    await sleep(migrationConfig.pollIntervalMs, signal);
  }

  return 0;
}

export async function runDevSchemaBackfillIfNeeded(params: {
  execaFn: typeof execa;
  backendAdapter: BackendAdapter;
  backfillConfig: AggregateBackfillConfig;
  functionsDir: string;
  targetArgs: string[];
  env?: Record<string, string | undefined>;
  signal: AbortSignal;
}): Promise<number> {
  const {
    execaFn,
    backendAdapter,
    backfillConfig,
    functionsDir,
    targetArgs,
    env,
    signal,
  } = params;
  const fingerprint = await computeAggregateIndexFingerprint(functionsDir);
  if (!fingerprint) {
    return 0;
  }

  const deploymentKey = getAggregateBackfillDeploymentKey(
    targetArgs,
    process.cwd(),
    env
  );
  const statePath = getDevAggregateBackfillStatePath();
  const state = readAggregateFingerprintState(statePath);
  const existing = state.entries[deploymentKey];
  if (existing?.fingerprint === fingerprint) {
    return 0;
  }

  logger.info(`aggregateBackfill resume (${deploymentKey} schema change)`);
  const exitCode = await runAggregateBackfillFlow({
    execaFn,
    backendAdapter,
    backfillConfig: {
      ...backfillConfig,
      enabled: 'on',
    },
    mode: 'resume',
    targetArgs,
    env,
    signal,
    context: 'dev',
  });
  if (exitCode !== 0 || signal.aborted) {
    return exitCode;
  }

  state.entries[deploymentKey] = {
    fingerprint,
    updatedAt: Date.now(),
  };
  writeAggregateFingerprintState(statePath, state);
  return 0;
}

export async function run(
  argv: string[],
  deps?: Partial<RunDeps>
): Promise<number> {
  const {
    execa: execaFn,
    runAnalyze: runAnalyzeFn,
    generateMeta: generateMetaFn,
    getConvexConfig: getConvexConfigFn,
    pullEnv: pullEnvFn,
    syncEnv: syncEnvFn,
    loadCliConfig: loadCliConfigFn,
    ensureConvexGitignoreEntry: ensureConvexGitignoreEntryFn,
    promptAdapter,
    enableDevSchemaWatch,
    realConvex: realConvexPath,
    realConcave: realConcavePath,
  } = {
    execa,
    runAnalyze,
    generateMeta,
    getConvexConfig,
    pullEnv,
    syncEnv,
    loadCliConfig,
    ensureConvexGitignoreEntry,
    promptAdapter: createPromptAdapter(),
    enableDevSchemaWatch: !deps,
    realConvex,
    realConcave: undefined,
    ...deps,
  };

  const {
    command,
    restArgs,
    convexArgs,
    backend: backendArg,
    debug: cliDebug,
    sharedDir: cliSharedDir,
    scope: cliScope,
    configPath,
  } = parseArgs(argv);

  let resolvedConfig: ReturnType<typeof loadCliConfigFn> | undefined;
  let resolvedBackend: CliBackend | undefined;
  let resolvedBackendAdapter: BackendAdapter | undefined;
  const getConfig = () => {
    resolvedConfig ??= loadCliConfigFn(configPath);
    return resolvedConfig;
  };
  const getBackend = () => {
    resolvedBackend ??= resolveConfiguredBackend({
      backendArg,
      config: getConfig(),
    });
    return resolvedBackend;
  };
  const getBackendAdapter = () => {
    resolvedBackendAdapter ??= createBackendAdapter({
      backend: getBackend(),
      realConvexPath,
      realConcavePath,
    });
    return resolvedBackendAdapter;
  };

  if (argv.length > 0) {
    const firstArg = argv[0];
    if (firstArg === '--help' || firstArg === '-h') {
      printRootHelp(getBackend());
      return 0;
    }
    if (firstArg === 'help') {
      printCommandHelp(argv[1] ?? '', getBackend());
      return 0;
    }
  }

  if (command === '--help' || command === '-h') {
    printRootHelp(getBackend());
    return 0;
  }

  if (
    (command === 'init' ||
      command === 'add' ||
      command === 'view' ||
      command === 'info' ||
      command === 'docs' ||
      command === 'auth' ||
      command === 'codegen' ||
      command === 'dev') &&
    hasHelpFlag(restArgs)
  ) {
    printCommandHelp(command, getBackend());
    return 0;
  }

  assertNoRemovedDevPreRunFlag(argv);

  if (command === 'create') {
    throw new Error(
      'Removed `kitcn create`. Use `kitcn init -t <next|start|vite>` for fresh app scaffolding.'
    );
  }

  if (command === 'init') {
    const initArgs = parseInitCommandArgs(restArgs);
    const result = await runInitCommandFlow({
      initArgs,
      backendArg,
      configPath,
      execaFn,
      generateMetaFn,
      syncEnvFn,
      loadCliConfigFn,
      ensureConvexGitignoreEntryFn,
      promptAdapter,
      realConvexPath,
      realConcavePath,
    });

    if (initArgs.json) {
      console.info(
        JSON.stringify({
          command: 'init',
          backend: result.backend,
          cwd: normalizePath(relative(process.cwd(), result.cwd) || '.'),
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          usedShadcn: result.usedShadcn,
          template: result.template,
          codegen: result.codegen,
          convexBootstrap: result.convexBootstrap,
        })
      );
    } else {
      logger.success(
        `✔ bootstrapped kitcn: ${result.created.length} created, ${result.updated.length} updated, ${result.skipped.length} skipped.`
      );
    }

    return 0;
  }

  if (command === 'dev') {
    if (cliScope) {
      throw new Error(
        '`--scope` is not supported for `kitcn dev`. Use `kitcn codegen --scope <all|auth|orm>` for scoped generation.'
      );
    }
    const config = getConfig();
    const backend = getBackend();
    const {
      remainingArgs: devArgsWithoutMigrationFlags,
      overrides: devMigrationOverrides,
    } = extractMigrationCliOptions(convexArgs);
    const { remainingArgs: devCommandArgs, overrides: devBackfillOverrides } =
      extractBackfillCliOptions(devArgsWithoutMigrationFlags);
    const sharedDir = cliSharedDir ?? config.paths.shared;
    const debug = cliDebug || config.dev.debug;
    assertNoRemovedDevPreRunFlag(config.dev.args);
    const convexDevArgs = [...config.dev.args, ...devCommandArgs];
    const backendDevArgs = applyConvexDevPreRunArgs(
      convexDevArgs,
      config.dev.preRun
    );
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
        '`dev.preRun` cannot be combined with Convex dev run flags (`--run`, `--start`, `--run-sh`, `--run-component`).'
      );
    }
    const backendAdapter = getBackendAdapter();
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

    // Initial codegen
    await generateMetaFn(sharedDir, {
      debug,
      scope: 'all',
      trimSegments,
    });

    // Spawn watcher as child process
    const isTs = __filename.endsWith('.ts');
    const watcherPath = isTs
      ? join(__dirname, 'watcher.ts')
      : join(__dirname, 'watcher.mjs');
    const runtime = isTs ? 'bun' : 'node';

    const watcherProcess = execaFn(runtime, [watcherPath], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: {
        ...createCommandEnv(),
        KITCN_API_OUTPUT_DIR: sharedDir || '',
        KITCN_DEBUG: debug ? '1' : '',
        KITCN_CODEGEN_SCOPE: 'all',
        KITCN_CODEGEN_TRIM_SEGMENTS: JSON.stringify(trimSegments),
      },
    });
    processes.push(watcherProcess);

    // Spawn real convex dev
    const convexProcess = execaFn(
      backendAdapter.command,
      [...backendAdapter.argsPrefix, 'dev', ...backendDevArgs],
      {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: createCommandEnv(),
        reject: false, // Don't throw on non-zero exit
      }
    );
    processes.push(convexProcess);

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
        while (
          schemaBackfillQueued &&
          !backfillAbortController.signal.aborted
        ) {
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

    // Setup cleanup handlers
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

    // Wait for either to exit, then cleanup
    const result = await Promise.race([
      watcherProcess.catch(() => ({ exitCode: 1 })),
      convexProcess,
    ]);
    backfillAbortController.abort();
    if (schemaDebounceTimer) {
      clearTimeout(schemaDebounceTimer);
    }
    await schemaWatcher?.close();
    cleanup();
    return result.exitCode ?? 0;
  }
  if (command === 'add') {
    const addArgs = parseAddCommandArgs(restArgs);
    const dryRunSpinner = createSpinner('Resolving plugin install plan...', {
      silent: addArgs.json || !addArgs.dryRun,
    });
    const config = getConfig();
    const sharedDir = cliSharedDir ?? config.paths.shared;
    const { functionsDir } = getConvexConfigFn(sharedDir);
    const selectedPlugin =
      addArgs.plugin ??
      (promptAdapter.isInteractive()
        ? await promptForPluginSelection(
            promptAdapter,
            [...SUPPORTED_PLUGINS].sort((a, b) => a.localeCompare(b)),
            'Select a plugin to add'
          )
        : undefined);
    if (!selectedPlugin) {
      throw new Error('Missing plugin name. Usage: kitcn add [plugin].');
    }
    dryRunSpinner.start();
    const pluginDescriptor = getPluginDescriptor(selectedPlugin);
    const resolvedPreset = await resolvePluginPreset(
      pluginDescriptor,
      promptAdapter,
      addArgs.preset
    );
    const allTemplates = collectPluginScaffoldTemplates(pluginDescriptor);
    const presetTemplates = resolvePresetScaffoldTemplates(
      pluginDescriptor,
      resolvedPreset
    );
    const initializationPlan = isInitialized({
      functionsDir,
      config,
    })
      ? null
      : buildInitializationPlan({
          config: overrideConfigBackend(
            config,
            resolveConfiguredBackend({
              backendArg,
              config,
            })
          ),
          configPathArg: configPath,
          envFields: pluginDescriptor.envFields ?? [],
        });
    const effectiveConfig = initializationPlan?.config ?? config;
    const effectiveSharedDir = cliSharedDir ?? effectiveConfig.paths.shared;
    const effectiveFunctionsDir =
      initializationPlan?.functionsDir ??
      getConvexConfigFn(effectiveSharedDir).functionsDir;
    const lockfile = readPluginLockfile(
      getPluginLockfilePath(effectiveFunctionsDir)
    );
    const existingTemplatePathMap = filterScaffoldTemplatePathMap(
      lockfile.plugins[selectedPlugin]?.files ?? {},
      allTemplates.map((template) => template.id)
    );
    const existingTemplateIds = Object.keys(existingTemplatePathMap);
    const presetTemplateIds = presetTemplates.map((template) => template.id);
    const selectionSource = resolveTemplateSelectionSource({
      presetArg: addArgs.preset,
      lockfileTemplateIds: existingTemplateIds,
    });
    const defaultTemplateIds = resolveAddTemplateDefaults({
      presetArg: addArgs.preset,
      lockfileTemplateIds: existingTemplateIds,
      presetTemplateIds,
      availableTemplateIds: allTemplates.map((template) => template.id),
    });
    const selectableTemplateIds =
      selectionSource === 'lockfile'
        ? [...new Set([...existingTemplateIds, ...presetTemplateIds])]
        : presetTemplateIds;
    const selectableTemplates = resolveTemplatesByIdOrThrow(
      pluginDescriptor,
      allTemplates,
      selectableTemplateIds,
      'add selection prompt'
    );
    const scaffoldRoots = resolvePluginScaffoldRoots(
      effectiveFunctionsDir,
      pluginDescriptor,
      effectiveConfig
    );
    const selectedTemplateIds =
      !addArgs.yes && promptAdapter.isInteractive()
        ? await promptForScaffoldTemplateSelection(
            promptAdapter,
            pluginDescriptor,
            selectableTemplates,
            defaultTemplateIds,
            scaffoldRoots
          )
        : defaultTemplateIds;
    const selectedTemplates = resolveTemplatesByIdOrThrow(
      pluginDescriptor,
      allTemplates,
      selectedTemplateIds,
      'add'
    );
    if (!addArgs.dryRun) {
      await applyPlanningDependencyInstall(
        pluginDescriptor.planningDependencies ?? [],
        execaFn
      );
    }
    const plan = await buildPluginInstallPlan({
      descriptor: pluginDescriptor,
      selectedPlugin,
      preset: resolvedPreset,
      selectionSource,
      presetTemplateIds,
      selectedTemplateIds,
      selectedTemplates,
      config: effectiveConfig,
      configPathArg: configPath,
      functionsDir: effectiveFunctionsDir,
      lockfile,
      existingTemplatePathMap,
      noCodegen: addArgs.noCodegen,
      overwrite: addArgs.overwrite,
      preview: addArgs.dryRun,
      promptAdapter,
      yes: addArgs.yes,
      includeEnvBootstrap: initializationPlan ? false : undefined,
      bootstrapFiles: initializationPlan?.files,
      bootstrapOperations: initializationPlan?.operations,
    });
    dryRunSpinner.stop();
    if (addArgs.dryRun) {
      if (addArgs.json) {
        console.info(
          JSON.stringify({
            command: 'add',
            dryRun: true,
            ...serializePluginInstallPlan(plan),
          })
        );
      } else if (addArgs.diff) {
        logger.write(formatPlanDiffOutput(plan as any, addArgs.diff));
      } else if (addArgs.view) {
        logger.write(formatPlanViewOutput(plan as any, addArgs.view));
      } else {
        logger.write(formatPlanSummaryOutput(plan as any));
      }
      return 0;
    }

    const applyResult = await applyPluginInstallPlanFiles(plan.files, {
      overwrite: addArgs.overwrite,
      yes: addArgs.yes,
      promptAdapter,
    });
    await applyDependencyInstallPlan(
      initializationPlan?.dependencyInstall ?? null,
      execaFn
    );
    const dependencyInstall = await applyPluginDependencyInstall(
      plan.dependency,
      execaFn
    );

    const payload = {
      command: 'add',
      dryRun: false,
      ...serializePluginInstallPlan(plan),
      dependency: {
        packageName: dependencyInstall.packageName,
        packageSpec: dependencyInstall.packageSpec,
        packageJsonPath: dependencyInstall.packageJsonPath
          ? normalizePath(
              relative(process.cwd(), dependencyInstall.packageJsonPath)
            )
          : undefined,
        installed: dependencyInstall.installed,
        skipped: dependencyInstall.skipped,
        reason: dependencyInstall.reason,
      },
      created: applyResult.created,
      manualActions: applyResult.manualActions,
      updated: applyResult.updated,
      skipped: applyResult.skipped,
    };
    if (addArgs.json) {
      console.info(JSON.stringify(payload));
    } else {
      logger.success(
        `✔ ${selectedPlugin} scaffold results: ${applyResult.created.length} created, ${applyResult.updated.length} updated, ${applyResult.skipped.length} skipped.`
      );
      if (applyResult.created.length > 0) {
        logger.write(
          `Created files:\n${applyResult.created
            .map((file) => `  - ${file}`)
            .join('\n')}`
        );
      }
      if (applyResult.updated.length > 0) {
        logger.write(
          `Updated files:\n${applyResult.updated
            .map((file) => `  - ${file}`)
            .join('\n')}`
        );
      }
      if (applyResult.skipped.length > 0) {
        logger.write(
          `Skipped files:\n${applyResult.skipped
            .map((file) => `  - ${file}`)
            .join('\n')}`
        );
        if (!addArgs.overwrite) {
          logger.info('Re-run with --overwrite to replace changed files.');
        }
      }
      if (applyResult.manualActions.length > 0) {
        logger.info('Manual actions:');
        logger.write(
          applyResult.manualActions.map((action) => `  - ${action}`).join('\n')
        );
      }
      if (dependencyInstall.installed) {
        logger.success(
          `Installed ${dependencyInstall.packageSpec ?? dependencyInstall.packageName}.`
        );
      }
      if (plan.dependencyHints.length > 0) {
        logger.write(
          `Dependencies:\n${plan.dependencyHints
            .map((hint) => `  - ${hint}`)
            .join('\n')}`
        );
      }
      if (plan.envReminders.length > 0) {
        const remindersByPath = new Map<string, PluginEnvReminder[]>();
        for (const reminder of plan.envReminders) {
          const existing = remindersByPath.get(reminder.path) ?? [];
          existing.push(reminder);
          remindersByPath.set(reminder.path, existing);
        }
        for (const [envPath, reminders] of remindersByPath.entries()) {
          logger.info(`Set plugin env values in ${envPath}.`);
          logger.write(
            `Environment values:\n${reminders
              .map(
                (reminder) =>
                  `  - ${reminder.key}${reminder.message ? `: ${reminder.message}` : ''}`
              )
              .join('\n')}`
          );
        }
      }
    }

    if (!addArgs.noCodegen) {
      const codegenExitCode = await runConfiguredCodegen({
        config: effectiveConfig,
        sharedDir,
        debug: cliDebug || effectiveConfig.codegen.debug,
        generateMetaFn,
        execaFn,
        realConvexPath,
        realConcavePath,
        backend: resolveConfiguredBackend({
          backendArg,
          config: effectiveConfig,
        }),
      });
      if (codegenExitCode !== 0) {
        return codegenExitCode;
      }
    }

    if (effectiveConfig.hooks.postAdd.length > 0) {
      for (const script of effectiveConfig.hooks.postAdd) {
        const hookExitCode = await runAfterScaffoldScript({
          script,
          execaFn,
        });
        if (hookExitCode !== 0) {
          return hookExitCode;
        }
      }
    }
    return 0;
  }
  if (command === 'view') {
    const viewArgs = parseViewCommandArgs(restArgs);
    const viewSpinner = createSpinner('Resolving plugin view...', {
      silent: viewArgs.json,
    });
    const config = getConfig();
    const sharedDir = cliSharedDir ?? config.paths.shared;
    const { functionsDir } = getConvexConfigFn(sharedDir);
    assertSchemaFileExists(functionsDir);
    viewSpinner.start();
    const lockfile = readPluginLockfile(getPluginLockfilePath(functionsDir));
    const schemaPlugins = await resolveSchemaInstalledPlugins(functionsDir);
    const installedPlugins = collectInstalledPluginKeys(
      lockfile,
      schemaPlugins
    );
    const selectedPlugin =
      viewArgs.plugin ??
      (promptAdapter.isInteractive()
        ? await promptForPluginSelection(
            promptAdapter,
            installedPlugins.length > 0
              ? installedPlugins
              : [...SUPPORTED_PLUGINS].sort((a, b) => a.localeCompare(b)),
            'Select a plugin to inspect'
          )
        : undefined);
    if (!selectedPlugin) {
      throw new Error('Missing plugin name. Usage: kitcn view [plugin].');
    }
    const pluginDescriptor = getPluginDescriptor(selectedPlugin);
    const resolvedPreset = await resolvePluginPreset(
      pluginDescriptor,
      promptAdapter,
      viewArgs.preset
    );
    const allTemplates = collectPluginScaffoldTemplates(pluginDescriptor);
    const existingTemplatePathMap = filterScaffoldTemplatePathMap(
      lockfile.plugins[selectedPlugin]?.files ?? {},
      allTemplates.map((template) => template.id)
    );
    const existingTemplateIds = Object.keys(existingTemplatePathMap);
    const presetTemplates = resolvePresetScaffoldTemplates(
      pluginDescriptor,
      resolvedPreset
    );
    const presetTemplateIds = presetTemplates.map((template) => template.id);
    const selectionSource = resolveTemplateSelectionSource({
      presetArg: viewArgs.preset,
      lockfileTemplateIds: existingTemplateIds,
    });
    const templateIdsUsed =
      selectionSource === 'lockfile' ? existingTemplateIds : presetTemplateIds;
    const selectedTemplates = resolveTemplatesByIdOrThrow(
      pluginDescriptor,
      allTemplates,
      templateIdsUsed,
      viewArgs.preset
        ? `view preset "${viewArgs.preset}"`
        : existingTemplateIds.length > 0
          ? 'view lockfile selection'
          : `view fallback preset "${resolvedPreset}"`
    );
    const plan = await buildPluginInstallPlan({
      descriptor: pluginDescriptor,
      selectedPlugin,
      preset: resolvedPreset,
      selectionSource,
      presetTemplateIds,
      selectedTemplateIds: templateIdsUsed,
      selectedTemplates,
      config,
      configPathArg: configPath,
      functionsDir,
      lockfile,
      existingTemplatePathMap,
      noCodegen: false,
      overwrite: false,
      preview: true,
      promptAdapter,
      yes: false,
    });
    viewSpinner.stop();
    if (viewArgs.json) {
      console.info(
        JSON.stringify({
          command: 'view',
          ...serializePluginInstallPlan(plan),
        })
      );
    } else {
      logger.write(formatPluginViewOutput(plan as any));
    }
    return 0;
  }
  if (command === 'info') {
    const infoArgs = parseInfoCommandArgs(restArgs);
    const infoSpinner = createSpinner('Inspecting project...', {
      silent: infoArgs.json,
    });
    infoSpinner.start();
    const config = getConfig();
    const backend = getBackend();
    const sharedDir = cliSharedDir ?? config.paths.shared;
    const { functionsDir } = getConvexConfigFn(sharedDir);
    const schemaPath = getSchemaFilePath(functionsDir);
    const lockfilePath = getPluginLockfilePath(functionsDir);
    const lockfile = readPluginLockfile(lockfilePath);
    const schemaPlugins = fs.existsSync(schemaPath)
      ? await resolveSchemaInstalledPlugins(functionsDir)
      : [];
    const installedPlugins = collectInstalledPluginKeys(
      lockfile,
      schemaPlugins
    );
    const versions = readPackageVersions(process.cwd());
    const pluginStates: InstalledPluginState[] = [];
    const schemaExists = fs.existsSync(schemaPath);
    for (const plugin of installedPlugins) {
      const descriptor = getPluginDescriptor(plugin);
      const allTemplates = collectPluginScaffoldTemplates(descriptor);
      const existingTemplatePathMap = filterScaffoldTemplatePathMap(
        lockfile.plugins[plugin]?.files ?? {},
        allTemplates.map((template) => template.id)
      );
      const existingTemplateIds = Object.keys(existingTemplatePathMap);
      const preset = descriptor.defaultPreset;
      const presetTemplates = resolvePresetScaffoldTemplates(
        descriptor,
        preset
      );
      const presetTemplateIds = presetTemplates.map((template) => template.id);
      const selectionSource = resolveTemplateSelectionSource({
        lockfileTemplateIds: existingTemplateIds,
      });
      const selectedTemplateIds =
        selectionSource === 'lockfile'
          ? existingTemplateIds
          : presetTemplateIds;
      const selectedTemplates = resolveTemplatesByIdOrThrow(
        descriptor,
        allTemplates,
        selectedTemplateIds,
        'info'
      );
      const dependency = await inspectPluginDependencyInstall({
        descriptor,
      });
      const plan = schemaExists
        ? await buildPluginInstallPlan({
            descriptor,
            selectedPlugin: plugin,
            preset,
            selectionSource,
            presetTemplateIds,
            selectedTemplateIds,
            selectedTemplates,
            config,
            configPathArg: configPath,
            functionsDir,
            lockfile,
            existingTemplatePathMap,
            noCodegen: false,
            overwrite: false,
            preview: true,
            promptAdapter,
            yes: false,
          })
        : null;
      const driftedFiles = plan
        ? plan.files.filter((file) => file.action !== 'skip').length
        : 0;
      pluginStates.push({
        plugin,
        packageName: descriptor.packageName,
        schemaRegistered: schemaPlugins.includes(plugin),
        lockfileRegistered: plugin in lockfile.plugins,
        missingDependency: !dependency.skipped,
        driftedFiles,
        clean: schemaExists && driftedFiles === 0,
        defaultPreset: descriptor.defaultPreset ?? null,
        docs: descriptor.docs,
      });
    }
    const schemaOnly = schemaPlugins.filter(
      (plugin) => !(plugin in lockfile.plugins)
    );
    const lockfileOnly = Object.keys(lockfile.plugins)
      .filter((plugin) => isSupportedPluginKey(plugin))
      .filter((plugin) => !schemaPlugins.includes(plugin as SupportedPlugin));
    const payload = {
      schemaPlugins,
      installedPlugins: pluginStates,
      project: {
        backend,
        functionsDir: normalizePath(relative(process.cwd(), functionsDir)),
        schemaPath: normalizePath(relative(process.cwd(), schemaPath)),
        schemaExists,
        lockfilePath: normalizePath(relative(process.cwd(), lockfilePath)),
        lockfileExists: fs.existsSync(lockfilePath),
        packageJsonPath: versions.packageJsonPath
          ? normalizePath(relative(process.cwd(), versions.packageJsonPath))
          : undefined,
        kitcnVersion: versions.kitcnVersion,
        convexVersion: versions.convexVersion,
        configPath: normalizePath(
          relative(process.cwd(), resolveConfigWritePath(configPath))
        ),
        config: {
          lib: config.paths.lib,
          shared: config.paths.shared,
          env: config.paths.env ?? null,
        },
      },
      mismatches: {
        schemaOnly,
        lockfileOnly,
      },
    };
    infoSpinner.stop();
    if (infoArgs.json) {
      console.info(JSON.stringify(payload));
    } else {
      logger.write(formatInfoOutput(payload));
    }
    return 0;
  }
  if (command === 'docs') {
    const docsArgs = parseDocsCommandArgs(restArgs);
    const docsSpinner = createSpinner('Resolving docs links...', {
      silent: docsArgs.json,
    });
    docsSpinner.start();
    const results = docsArgs.topics.map((topic) => {
      const doc = resolveDocTopic(topic);
      if (!doc) {
        throw new Error(`Unknown docs topic "${topic}".`);
      }
      return {
        topic,
        ...doc,
      };
    });
    docsSpinner.stop();
    if (docsArgs.json) {
      console.info(JSON.stringify({ command: 'docs', topics: results }));
    } else {
      logger.write(formatDocsOutput(results));
    }
    return 0;
  }
  if (command === 'codegen') {
    const config = getConfig();
    const sharedDir = cliSharedDir ?? config.paths.shared;
    const scope = cliScope ?? config.codegen.scope;
    const debug = cliDebug || config.codegen.debug;
    if (scope) {
      const scopedConfig = {
        ...config,
        codegen: {
          ...config.codegen,
          scope,
        },
      };
      return runConfiguredCodegen({
        config: scopedConfig,
        sharedDir,
        debug,
        generateMetaFn,
        execaFn,
        syncEnvFn,
        realConvexPath,
        realConcavePath,
        additionalConvexArgs: convexArgs,
        backend: getBackend(),
      });
    }
    return runConfiguredCodegen({
      config,
      sharedDir,
      debug,
      generateMetaFn,
      execaFn,
      syncEnvFn,
      realConvexPath,
      realConcavePath,
      additionalConvexArgs: convexArgs,
      backend: getBackend(),
    });
  }
  if (command === 'env') {
    const subcommand = convexArgs[0];
    const config = getConfig();
    const sharedDir = cliSharedDir ?? config.paths.shared;

    if (subcommand === 'push') {
      const force = restArgs.includes('--force');
      const rotate = restArgs.includes('--rotate');
      const targetArgs = convexArgs.slice(1).filter((arg) => {
        return arg !== '--force' && arg !== '--rotate' && arg !== '--from-file';
      });
      await syncEnvFn({
        authSyncMode: 'auto',
        force,
        rotate,
        sharedDir,
        targetArgs,
      });
      return 0;
    }
    if (subcommand === 'pull') {
      const outIndex = convexArgs.findIndex(
        (arg) => arg === '--out' || arg.startsWith('--out=')
      );
      const outFilePath =
        outIndex === -1
          ? undefined
          : convexArgs[outIndex]?.startsWith('--out=')
            ? convexArgs[outIndex]!.slice('--out='.length)
            : convexArgs[outIndex + 1];
      const targetArgs = convexArgs
        .slice(1)
        .filter((arg, index) => {
          if (arg === '--out' || arg.startsWith('--out=')) {
            return false;
          }
          if (outIndex !== -1 && index === outIndex) {
            return false;
          }
          if (outIndex !== -1 && convexArgs[outIndex] === '--out') {
            return index !== outIndex;
          }
          return true;
        })
        .filter((_arg, index, args) => {
          if (index > 0 && args[index - 1] === '--out') {
            return false;
          }
          return true;
        });
      await pullEnvFn({ outFilePath, targetArgs });
      return 0;
    }
    if (getBackend() === 'concave') {
      throw new Error('`kitcn env` is only supported on the Convex backend.');
    }
    const backendAdapter = getBackendAdapter();
    const result = await execaFn(
      backendAdapter.command,
      [...backendAdapter.argsPrefix, 'env', ...convexArgs],
      {
        stdio: 'inherit',
        cwd: process.cwd(),
        reject: false,
      }
    );
    return result.exitCode ?? 0;
  }
  if (command === 'analyze') {
    return runAnalyzeFn(restArgs);
  }
  if (command === 'reset') {
    const {
      confirmed,
      beforeHook,
      afterHook,
      remainingArgs: resetCommandArgs,
    } = extractResetCliOptions(convexArgs);
    if (!confirmed) {
      throw new Error('`kitcn reset` is destructive. Re-run with `--yes`.');
    }

    const config = getConfig();
    const backend = getBackend();
    const backendAdapter = getBackendAdapter();
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
  }
  if (command === 'deploy') {
    const config = getConfig();
    const backend = getBackend();
    const backendAdapter = getBackendAdapter();
    const {
      remainingArgs: deployArgsWithoutMigrationFlags,
      overrides: deployMigrationOverrides,
    } = extractMigrationCliOptions(convexArgs);
    const {
      remainingArgs: deployCommandArgs,
      overrides: deployBackfillOverrides,
    } = extractBackfillCliOptions(deployArgsWithoutMigrationFlags);
    const deployArgs = [...config.deploy.args, ...deployCommandArgs];
    const deployResult = await execaFn(
      backendAdapter.command,
      [...backendAdapter.argsPrefix, 'deploy', ...deployArgs],
      {
        stdio: 'inherit',
        cwd: process.cwd(),
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
      context: 'deploy',
    });
  }
  if (command === 'migrate') {
    const subcommand = restArgs[0];
    if (
      subcommand !== 'create' &&
      subcommand !== 'up' &&
      subcommand !== 'down' &&
      subcommand !== 'status' &&
      subcommand !== 'cancel'
    ) {
      throw new Error(
        'Unknown migrate command. Use: `kitcn migrate create|up|down|status|cancel`.'
      );
    }

    const config = getConfig();
    const backend = getBackend();
    const backendAdapter = getBackendAdapter();

    if (subcommand === 'create') {
      const rawName = restArgs.slice(1).join(' ').trim();
      if (!rawName) {
        throw new Error(
          'Missing migration name. Usage: `kitcn migrate create <name>`.'
        );
      }
      const sharedDir = cliSharedDir ?? config.paths.shared;
      const { functionsDir } = getConvexConfigFn(sharedDir);
      await runMigrationCreate({
        migrationName: rawName,
        functionsDir,
      });
      return 0;
    }

    const {
      remainingArgs: migrationCommandArgs,
      overrides: migrationOverrides,
    } = extractMigrationCliOptions(restArgs.slice(1));
    const migrationConfig = {
      ...resolveMigrationConfig(config.deploy.migrations, migrationOverrides),
      enabled: 'on' as const,
    };
    const commandArgs = [...config.deploy.args, ...migrationCommandArgs];
    const targetArgs = extractBackendRunTargetArgs(backend, commandArgs);

    if (subcommand === 'up') {
      return runMigrationFlow({
        execaFn,
        backendAdapter,
        migrationConfig,
        targetArgs,
        context: 'migration',
        direction: 'up',
      });
    }

    if (subcommand === 'down') {
      const { remainingArgs, steps, to } =
        extractMigrationDownOptions(commandArgs);
      const downTargetArgs = extractBackendRunTargetArgs(
        backend,
        remainingArgs
      );
      return runMigrationFlow({
        execaFn,
        backendAdapter,
        migrationConfig,
        targetArgs: downTargetArgs,
        context: 'migration',
        direction: 'down',
        steps,
        to,
      });
    }

    if (subcommand === 'status') {
      const statusResult = await runBackendFunction(
        execaFn,
        backendAdapter,
        'generated/server:migrationStatus',
        {},
        targetArgs
      );
      return statusResult.exitCode;
    }

    let runId: string | undefined;
    const cancelArgs: string[] = [];
    for (let i = 0; i < commandArgs.length; i += 1) {
      const arg = commandArgs[i];
      if (arg === '--run-id') {
        const { value, nextIndex } = readFlagValue(commandArgs, i, '--run-id');
        runId = value;
        i = nextIndex;
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
      cancelTargetArgs
    );
    return cancelResult.exitCode;
  }
  if (command === 'aggregate') {
    const subcommand = restArgs[0];
    if (
      subcommand !== 'rebuild' &&
      subcommand !== 'backfill' &&
      subcommand !== 'prune'
    ) {
      throw new Error(
        'Unknown aggregate command. Use: `kitcn aggregate backfill`, `kitcn aggregate rebuild`, or `kitcn aggregate prune`.'
      );
    }

    const config = getConfig();
    const backend = getBackend();
    const backendAdapter = getBackendAdapter();
    const {
      remainingArgs: aggregateCommandArgs,
      overrides: aggregateBackfillOverrides,
    } = extractBackfillCliOptions(restArgs.slice(1));
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
  }
  const backendAdapter = getBackendAdapter();
  const result = await execaFn(
    backendAdapter.command,
    [...backendAdapter.argsPrefix, command, ...convexArgs],
    {
      stdio: 'inherit',
      cwd: process.cwd(),
      reject: false,
    }
  );
  return result.exitCode ?? 0;
}

export function isEntryPoint(
  entry: string | undefined,
  filename: string
): boolean {
  if (!entry) return false;
  // bin shims are often symlinks (e.g. node_modules/.bin/kitcn).
  // Comparing resolved paths without dereferencing symlinks makes the CLI no-op.
  try {
    return (
      resolve(fs.realpathSync(entry)) === resolve(fs.realpathSync(filename))
    );
  } catch {
    return resolve(entry) === resolve(filename);
  }
}
