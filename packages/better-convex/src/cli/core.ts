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
import { execa } from 'execa';
import { createJiti } from 'jiti';
import { getTableConfig } from '../orm/introspection.js';
import { getSchemaRelations } from '../orm/schema.js';
import { runAnalyze } from './analyze.js';
import { generateMeta, getConvexConfig } from './codegen.js';
import {
  type AggregateBackfillConfig,
  type BackfillEnabled,
  type BetterConvexBackend,
  type BetterConvexConfig,
  loadBetterConvexConfig,
  type MigrationConfig,
} from './config.js';
import { syncEnv } from './env.js';
import {
  FUNCTIONS_DIR_IMPORT_PLACEHOLDER,
  getPluginCatalogEntry,
  getSupportedPluginKeys,
  isSupportedPluginKey,
  PLUGIN_CONFIG_IMPORT_PLACEHOLDER,
  PLUGIN_SCHEMA_IMPORT_PLACEHOLDER,
  type PluginCatalogEntry,
  type PluginEnvField,
  PROJECT_CRPC_IMPORT_PLACEHOLDER,
  PROJECT_GET_ENV_IMPORT_PLACEHOLDER,
  PROJECT_SHARED_API_IMPORT_PLACEHOLDER,
  type SupportedPluginKey,
} from './plugin-catalog.js';
import { INIT_CONVEX_CONFIG_TEMPLATE } from './plugins/init/init-convex-config.template.js';
import {
  INIT_CRPC_IMPORT_MARKER,
  INIT_CRPC_TEMPLATE,
} from './plugins/init/init-crpc.template.js';
import {
  INIT_HTTP_IMPORT_MARKER,
  INIT_HTTP_ROUTE_MARKER,
  INIT_HTTP_TEMPLATE,
} from './plugins/init/init-http.template.js';
import { INIT_NEXT_CLIENT_CRPC_TEMPLATE } from './plugins/init/init-next-client-crpc.template.js';
import { INIT_NEXT_CONVEX_PROVIDER_TEMPLATE } from './plugins/init/init-next-convex-provider.template.js';
import { renderInitNextEnvLocalTemplate } from './plugins/init/init-next-env-local.template.js';
import { renderInitNextPackageJsonTemplate } from './plugins/init/init-next-package-json.template.js';
import { INIT_NEXT_PROVIDERS_TEMPLATE } from './plugins/init/init-next-providers.template.js';
import { INIT_NEXT_QUERY_CLIENT_TEMPLATE } from './plugins/init/init-next-query-client.template.js';
import { INIT_NEXT_RSC_TEMPLATE } from './plugins/init/init-next-rsc.template.js';
import { INIT_NEXT_SERVER_TEMPLATE } from './plugins/init/init-next-server.template.js';
import { INIT_SCHEMA_TEMPLATE } from './plugins/init/init-schema.template.js';
import { isContentEquivalent } from './utils/compare.js';
import {
  formatPlanDiff as formatPlanDiffOutput,
  formatPlanSummary as formatPlanSummaryOutput,
  formatPlanView as formatPlanViewOutput,
  formatPluginView as formatPluginViewOutput,
} from './utils/dry-run-formatter.js';
import { highlighter } from './utils/highlighter.js';
import { logger } from './utils/logger.js';
import { createSpinner } from './utils/spinner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve real convex CLI binary
// Can't use require.resolve('convex/bin/main.js') because it's not exported
// Use the path relative to the convex package
const require = createRequire(import.meta.url);
const convexPkg = require.resolve('convex/package.json');
const realConvex = join(dirname(convexPkg), 'bin/main.js');
const MISSING_BACKFILL_FUNCTION_RE =
  /could not find function|function .* was not found|unknown function/i;
const GITIGNORE_CONVEX_ENTRY_RE = /(^|\r?\n)\.convex\/?\s*(\r?\n|$)/m;
const TS_EXTENSION_RE = /\.ts$/;
const DEFINE_SCHEMA_CALL_RE = /defineSchema\s*\(([\s\S]*?)\)/m;
const CHAIN_EXTEND_RE = /\.extend\s*\(([\s\S]*?)\)/m;
const CHAIN_RELATIONS_RE = /\.relations\s*\(/m;
const CHAIN_TRIGGERS_RE = /\.triggers\s*\(/m;
const AGGREGATE_STATE_RELATIVE_PATH = join(
  '.convex',
  'better-convex',
  'aggregate-backfill-state.json'
);
const AGGREGATE_STATE_VERSION = 1;
export const INIT_SHADCN_PACKAGE_SPEC = 'shadcn@4.0.1';
const INIT_DEFAULT_DEV_DEPLOYMENT = 'local';
const INIT_LOCAL_BOOTSTRAP_TIMEOUT_MS = 30_000;
const INIT_GENERATED_SERVER_STUB_TEMPLATE = `import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server';
import { initCRPC as baseInitCRPC } from 'better-convex/server';

export type QueryCtx = GenericQueryCtx<GenericDataModel>;
export type MutationCtx = GenericMutationCtx<GenericDataModel>;
export type ActionCtx = GenericActionCtx<GenericDataModel>;
export type GenericCtx = QueryCtx | MutationCtx | ActionCtx;

export const initCRPC = baseInitCRPC;
`;
const INIT_CONVEX_BOOTSTRAP_REQUIRED_RE =
  /No CONVEX_DEPLOYMENT set|Cannot prompt for input in non-interactive terminals|Local backend isn't running/i;
const INIT_LOCAL_BOOTSTRAP_READY_RE = /(Convex|Concave) functions ready!/i;
const INIT_NEXT_TSCONFIG_ALIAS_RE = /"@\/\*"\s*:\s*\[\s*"([^"]+)"\s*\]/m;
const INIT_NEXT_IMPORT_QUOTE_RE = /from\s+(['"])/;
const INIT_NEXT_IMPORT_SEMICOLON_RE = /^\s*import .*;\s*$/m;
const INIT_NEXT_TRAILING_NEWLINES_RE = /\n*$/;
const INIT_NEXT_PROVIDERS_IMPORT_RE = /from ['"]@\/components\/providers['"]/;
const INIT_NEXT_CHILDREN_SLOT_RE = /\{\s*children\s*\}/g;

export type ParsedArgs = {
  command: string;
  restArgs: string[];
  convexArgs: string[];
  backend?: BetterConvexBackend;
  debug: boolean;
  sharedDir?: string;
  scope?: 'all' | 'auth' | 'orm';
  configPath?: string;
};

const VALID_SCOPES = new Set(['all', 'auth', 'orm']);
const VALID_BACKENDS = new Set<BetterConvexBackend>(['convex', 'concave']);
const ORM_SCHEMA_EXTENSIONS = Symbol.for('better-convex:OrmSchemaExtensions');
type SupportedPlugin = SupportedPluginKey;
const SUPPORTED_PLUGINS = new Set<SupportedPlugin>(getSupportedPluginKeys());
type PluginLockfile = {
  plugins: Record<string, { package: string; files?: Record<string, string> }>;
};
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
  template?: string;
  cwd?: string;
  name?: string;
  team?: string;
  project?: string;
  devDeployment?: 'cloud' | 'local';
};
export type InitCodegenStatus = 'generated' | 'stubbed';
export type InitConvexBootstrapStatus = 'existing' | 'created' | 'missing';
export type InitRunResult = {
  backend: BetterConvexBackend;
  cwd: string;
  created: string[];
  updated: string[];
  skipped: string[];
  usedShadcn: boolean;
  template: string | null;
  codegen: InitCodegenStatus;
  convexBootstrap: InitConvexBootstrapStatus;
};
type ScaffoldFile = {
  templateId: string;
  filePath: string;
  lockfilePath: string;
  content: string;
};
type ScaffoldTemplate = {
  id: string;
  path: string;
  content: string;
  target: 'functions' | 'lib';
  requires: string[];
  dependencyHintMessage?: string;
  dependencyHints: string[];
};
type ResolvedScaffoldRoots = {
  functionsRootDir: string;
  libRootDir: string;
  crpcFilePath: string;
  sharedApiFilePath: string;
  envFilePath: string;
};

type PluginEnvReminder = {
  key: string;
  path: string;
  message?: string;
};

type PluginDescriptor = PluginCatalogEntry;

type PluginDependencyInstallResult = {
  packageName?: string;
  packageJsonPath?: string;
  installed: boolean;
  skipped: boolean;
  reason?: 'missing_package_json' | 'already_present' | 'dry_run';
};

type PlanSelectionSource = 'preset' | 'lockfile';
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

type PluginInstallPlan = {
  plugin: SupportedPlugin;
  preset: string;
  selectionSource: PlanSelectionSource;
  presetTemplateIds: string[];
  selectedTemplateIds: string[];
  files: PluginInstallPlanFile[];
  operations: PluginInstallPlanOperation[];
  dependencyHints: string[];
  envReminders: PluginEnvReminder[];
  docs: PluginCatalogEntry['docs'];
  nextSteps: string[];
  dependency: PluginDependencyInstallResult;
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
  createReason: string;
  updateReason: string;
  skipReason: string;
};

type InitNextScaffoldContext = {
  usesSrc: boolean;
  appDir: string;
  componentsDir: string;
  libDir: string;
  convexClientDir: string;
  tailwindCssPath: string;
  tsconfigAliasPath: './*' | './src/*';
};

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
  confirm: (message: string) => Promise<boolean>;
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

const ADD_HELP_TEXT = `Usage: better-convex add [plugin] [options]

Options:
  --yes, -y         Deterministic non-interactive mode
  --json            Machine-readable command output
  --dry-run         Show planned operations without writing files
  --diff [path]     Show unified diffs for planned file changes
  --view [path]     Show planned file contents
  --overwrite       Overwrite existing changed files without prompt
  --no-codegen      Skip automatic codegen after add
  --preset, -p      Plugin preset override`;

const VIEW_HELP_TEXT = `Usage: better-convex view [plugin] [options]

Options:
  --json            Machine-readable command output
  --preset, -p      Plugin preset override`;

const INFO_HELP_TEXT = `Usage: better-convex info [options]

Options:
  --json            Machine-readable project inspection output`;

const DOCS_HELP_TEXT = `Usage: better-convex docs <topic...> [options]

Options:
  --json            Machine-readable docs link output`;

const CODEGEN_HELP_TEXT = `Usage: better-convex codegen [options]

Options:
  --api <dir>       Output directory (default from config)
  --scope <mode>    Generation scope: all | auth | orm
  --config <path>   Config path override
  --debug           Show detailed output`;

const INIT_HELP_TEXT = `Usage: better-convex init [options]

Options:
  --template, -t    App template (only "next" is supported)
  --cwd             Target directory
  --name            Project name when creating a fresh app
  --team            Convex team slug for non-interactive bootstrap
  --project         Convex project slug for non-interactive bootstrap
  --dev-deployment  Convex dev deployment kind (cloud|local, default: local)
  --yes, -y         Deterministic non-interactive mode
  --defaults        Use default shadcn init answers
  --json            Machine-readable command output`;

const BASELINE_DEPENDENCIES = [
  'convex',
  'better-convex',
  'zod',
  '@tanstack/react-query',
  'hono',
] as const;
const INIT_NEXT_TEMPLATE_DEPENDENCIES = ['superjson'] as const;
const DEFAULT_INIT_TEMPLATE = 'next';
const CRPC_META_RATELIMIT_RE = /ratelimit\?: string;/;
const PUBLIC_MUTATION_LINE_RE =
  /export const publicMutation = c\.mutation(?:\.use\(ratelimit\.middleware\(\)\))?;/;

const DOCS_BASE_URL = 'https://better-convex.vercel.app/docs';

const CORE_DOC_TOPICS: Record<string, CliDocEntry> = {
  cli: {
    title: 'CLI',
    localPath: 'www/content/docs/cli.mdx',
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

// Parse args: better-convex [command] [--api <dir>] [--scope <all|auth|orm>] [--config <path>] [--debug] [...convex-args]
export function parseArgs(argv: string[]): ParsedArgs {
  let debug = false;
  let sharedDir: string | undefined;
  let scope: 'all' | 'auth' | 'orm' | undefined;
  let configPath: string | undefined;
  let backend: BetterConvexBackend | undefined;

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
      if (!value || !VALID_BACKENDS.has(value as BetterConvexBackend)) {
        throw new Error(
          `Invalid --backend value "${value ?? ''}". Expected one of: convex, concave.`
        );
      }
      backend = value as BetterConvexBackend;
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

export function getRootHelpText(
  backend: BetterConvexBackend = 'convex'
): string {
  const backendPassThrough =
    backend === 'concave'
      ? [
          '',
          'Concave passthrough:',
          `  ${CONCAVE_PASSTHROUGH_COMMANDS.join(', ')}`,
          '  Raw `env` passthrough is Convex-only. Use `better-convex env sync` here.',
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
  init                         Bootstrap a Better Convex app in-place
  create                       Alias for init
  dev                          Run dev workflow with codegen/watch passthrough
  codegen                      Generate Better Convex outputs
  add [plugin]                 Add a plugin scaffold + schema registration
  view [plugin]                Inspect a plugin install plan without writing
  info                         Inspect project + installed plugin state
  docs <topic...>              Show docs links for CLI and plugins
  env                          Env helper and backend env passthrough
  deploy                       Deploy with migrations/backfill flows
  migrate                      Migration lifecycle commands
  aggregate                    Aggregate backfill/rebuild/prune commands
  analyze                      Analyze runtime bundle
  reset                        Destructive database reset (requires --yes)
${backendPassThrough}

Run "better-convex <command> --help" for command options.`;
}

function printRootHelp(backend: BetterConvexBackend = 'convex'): void {
  logger.write(getRootHelpText(backend));
}

function printCommandHelp(
  command: string,
  backend: BetterConvexBackend = 'convex'
): void {
  if (command === 'init' || command === 'create') {
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
  if (command === 'codegen') {
    logger.write(CODEGEN_HELP_TEXT);
    return;
  }
  printRootHelp(backend);
}

function createPromptAdapter(): PromptAdapter {
  return {
    isInteractive: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
    confirm: async (message: string) => {
      const response = await confirm({ message });
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
    syncEnv,
    loadBetterConvexConfig,
    ensureConvexGitignoreEntry,
    promptAdapter: createPromptAdapter(),
    enableDevSchemaWatch: true,
    realConvex,
    realConcave: undefined,
    ...deps,
  };
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
  let template: string | undefined;
  let cwd: string | undefined;
  let name: string | undefined;
  let team: string | undefined;
  let project: string | undefined;
  let devDeployment: 'cloud' | 'local' | undefined;

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
    if (arg === '--team') {
      const value = args[i + 1];
      if (!value) {
        throw new Error('Missing value for --team.');
      }
      team = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('--team=')) {
      const value = arg.slice('--team='.length);
      if (!value) {
        throw new Error('Missing value for --team.');
      }
      team = value;
      continue;
    }
    if (arg === '--project') {
      const value = args[i + 1];
      if (!value) {
        throw new Error('Missing value for --project.');
      }
      project = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('--project=')) {
      const value = arg.slice('--project='.length);
      if (!value) {
        throw new Error('Missing value for --project.');
      }
      project = value;
      continue;
    }
    if (arg === '--dev-deployment') {
      const value = args[i + 1];
      if (!value) {
        throw new Error('Missing value for --dev-deployment.');
      }
      if (value !== 'cloud' && value !== 'local') {
        throw new Error(
          `Invalid --dev-deployment value "${value}". Expected "cloud" or "local".`
        );
      }
      devDeployment = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('--dev-deployment=')) {
      const value = arg.slice('--dev-deployment='.length);
      if (!value) {
        throw new Error('Missing value for --dev-deployment.');
      }
      if (value !== 'cloud' && value !== 'local') {
        throw new Error(
          `Invalid --dev-deployment value "${value}". Expected "cloud" or "local".`
        );
      }
      devDeployment = value;
      continue;
    }
    throw new Error(`Unknown init flag "${arg}".`);
  }

  return {
    yes,
    json,
    defaults,
    template,
    cwd,
    name,
    team,
    project,
    devDeployment,
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
    throw new Error(
      'Missing docs topic. Usage: better-convex docs <topic...>.'
    );
  }
  return { json, topics };
}

function getPluginDescriptor(plugin: SupportedPlugin): PluginDescriptor {
  return getPluginCatalogEntry(plugin);
}

function resolvePluginPackageName(
  descriptor: PluginDescriptor
): string | undefined {
  return descriptor.packageName;
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

function hasDependency(
  pkgJson: Record<string, unknown>,
  packageName: string
): boolean {
  const sections = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ] as const;
  return sections.some((section) => {
    const value = pkgJson[section];
    return (
      typeof value === 'object' &&
      value !== null &&
      packageName in (value as Record<string, unknown>)
    );
  });
}

export async function inspectPluginDependencyInstall(params: {
  descriptor: PluginDescriptor;
}): Promise<PluginDependencyInstallResult> {
  const packageName = resolvePluginPackageName(params.descriptor);
  if (!packageName) {
    return {
      installed: false,
      skipped: true,
      reason: 'missing_package_json',
    };
  }
  const packageJsonPath = findNearestPackageJsonPath(process.cwd());
  if (!packageJsonPath) {
    return {
      packageName,
      installed: false,
      skipped: true,
      reason: 'missing_package_json',
    };
  }
  const packageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, 'utf8')
  ) as Record<string, unknown>;
  if (hasDependency(packageJson, packageName)) {
    return {
      packageName,
      packageJsonPath,
      installed: false,
      skipped: true,
      reason: 'already_present',
    };
  }

  return {
    packageName,
    packageJsonPath,
    installed: false,
    skipped: false,
  };
}

export async function applyPluginDependencyInstall(
  install: PluginDependencyInstallResult,
  execaFn: typeof execa
): Promise<PluginDependencyInstallResult> {
  if (install.skipped || !install.packageName || !install.packageJsonPath) {
    return install;
  }

  await execaFn('bun', ['add', install.packageName], {
    cwd: dirname(install.packageJsonPath),
    stdio: 'inherit',
  });
  return {
    packageName: install.packageName,
    packageJsonPath: install.packageJsonPath,
    installed: true,
    skipped: false,
  };
}

export async function createProjectWithShadcn(params: {
  projectDir: string;
  template: string;
  yes: boolean;
  defaults: boolean;
  execaFn: typeof execa;
}): Promise<void> {
  const shadcnCwd = dirname(params.projectDir);
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

  const result = await params.execaFn(command, args, {
    cwd: process.cwd(),
    reject: false,
    stdio: 'inherit',
  });
  if ((result.exitCode ?? 0) !== 0) {
    throw new Error(`shadcn init failed: ${command} ${args.join(' ')}`);
  }
}

export async function resolvePluginPreset(
  descriptor: PluginDescriptor,
  promptAdapter: PromptAdapter,
  presetArg?: string
): Promise<string> {
  const profileKeys = descriptor.presets.map((profile) => profile.key);
  const availablePresets = new Set(profileKeys);
  if (
    presetArg &&
    availablePresets.size > 0 &&
    !availablePresets.has(presetArg)
  ) {
    throw new Error(
      `Invalid preset "${presetArg}" for plugin "${descriptor.key}". Expected one of: ${[
        ...availablePresets,
      ].join(', ')}.`
    );
  }

  const fallbackPreset = descriptor.defaultPreset ?? profileKeys[0];
  const resolvedPreset = presetArg ?? fallbackPreset;
  if (resolvedPreset) {
    return resolvedPreset;
  }

  if (profileKeys.length > 0 && promptAdapter.isInteractive()) {
    const selected = await promptAdapter.select({
      message: `Select preset for plugin "${descriptor.key}"`,
      options: descriptor.presets.map((profile) => ({
        value: profile.key,
        label: profile.key,
        hint: profile.description,
      })),
    });
    if (isCancel(selected)) {
      throw new Error('Preset selection cancelled.');
    }
    return selected as string;
  }

  throw new Error(
    `Plugin "${descriptor.key}" does not define a resolvable preset. Expected one of: ${[
      ...availablePresets,
    ].join(', ')}.`
  );
}

function getPluginDisplayHint(
  descriptor: PluginDescriptor
): string | undefined {
  return descriptor.presets[0]?.description;
}

export async function promptForPluginSelection(
  promptAdapter: PromptAdapter,
  plugins: readonly SupportedPlugin[],
  message: string
): Promise<SupportedPlugin> {
  const options = plugins.map((plugin) => {
    const descriptor = getPluginDescriptor(plugin);
    return {
      value: plugin,
      label: plugin,
      hint: getPluginDisplayHint(descriptor),
    };
  });
  const selected = await promptAdapter.select({
    message,
    options,
  });
  if (isCancel(selected)) {
    throw new Error('Plugin selection cancelled.');
  }
  return selected as SupportedPlugin;
}

function normalizeTemplateIdOrThrow(templateId: string, fieldName: string) {
  const normalized = templateId.trim();
  if (normalized.length === 0) {
    throw new Error(`Invalid ${fieldName}: template id must be non-empty.`);
  }
  return normalized;
}

export function resolvePresetScaffoldTemplates(
  descriptor: PluginDescriptor,
  preset: string
): ScaffoldTemplate[] {
  const presetDefinition = descriptor.presets.find(
    (item) => item.key === preset
  );
  if (!presetDefinition) {
    throw new Error(
      `Invalid preset "${preset}" for plugin "${descriptor.key}". Expected one of: ${descriptor.presets
        .map((item) => item.key)
        .join(', ')}.`
    );
  }
  const templateById = new Map(
    collectPluginScaffoldTemplates(descriptor).map(
      (template) => [template.id, template] as const
    )
  );
  const seenTemplateIds = new Set<string>();
  const templates: ScaffoldTemplate[] = [];
  for (const templateIdRaw of presetDefinition.templateIds) {
    const templateId = normalizeTemplateIdOrThrow(
      templateIdRaw,
      `${descriptor.key} scaffold template id`
    );
    if (seenTemplateIds.has(templateId)) {
      throw new Error(
        `Duplicate scaffold template id "${templateId}" in plugin "${descriptor.key}" preset "${preset}".`
      );
    }
    const template = templateById.get(templateId);
    if (!template) {
      throw new Error(
        `Preset "${preset}" in plugin "${descriptor.key}" references missing template "${templateId}".`
      );
    }
    seenTemplateIds.add(templateId);
    templates.push(template);
  }
  return templates.sort(
    (a, b) =>
      a.target.localeCompare(b.target) ||
      a.path.localeCompare(b.path) ||
      a.id.localeCompare(b.id)
  );
}

export function collectPluginScaffoldTemplates(
  descriptor: PluginDescriptor
): ScaffoldTemplate[] {
  const orderedTemplates: ScaffoldTemplate[] = [];
  const seenById = new Map<string, ScaffoldTemplate>();
  for (const template of descriptor.templates) {
    const templateId = normalizeTemplateIdOrThrow(
      template.id,
      `${descriptor.key} scaffold template id`
    );
    const templatePath = normalizeRelativePathOrThrow(
      template.path,
      `${descriptor.key} scaffold template "${templateId}" path`
    );
    const normalizedRequires = [...new Set(template.requires ?? [])]
      .map((requirement) =>
        normalizeTemplateIdOrThrow(
          requirement,
          `${descriptor.key} scaffold template "${templateId}" dependency`
        )
      )
      .sort((a, b) => a.localeCompare(b));
    if (seenById.has(templateId)) {
      throw new Error(
        `Duplicate scaffold template id "${templateId}" in plugin "${descriptor.key}".`
      );
    }
    const normalizedTemplate: ScaffoldTemplate = {
      id: templateId,
      path: templatePath,
      content: template.content,
      target: template.target === 'lib' ? 'lib' : 'functions',
      requires: normalizedRequires,
      dependencyHintMessage:
        typeof template.dependencyHintMessage === 'string' &&
        template.dependencyHintMessage.trim().length > 0
          ? template.dependencyHintMessage.trim()
          : undefined,
      dependencyHints: [...new Set(template.dependencyHints ?? [])].filter(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0
      ),
    };
    seenById.set(templateId, normalizedTemplate);
    orderedTemplates.push(normalizedTemplate);
  }

  for (const preset of descriptor.presets) {
    for (const templateIdRaw of preset.templateIds) {
      const templateId = normalizeTemplateIdOrThrow(
        templateIdRaw,
        `${descriptor.key} preset "${preset.key}" template id`
      );
      if (!seenById.has(templateId)) {
        throw new Error(
          `Preset "${preset.key}" in plugin "${descriptor.key}" references missing template "${templateId}".`
        );
      }
    }
  }

  return orderedTemplates.sort(
    (a, b) =>
      a.target.localeCompare(b.target) ||
      a.path.localeCompare(b.path) ||
      a.id.localeCompare(b.id)
  );
}

function resolveTemplateSelectionWithDependencies(
  descriptor: PluginDescriptor,
  allTemplates: readonly ScaffoldTemplate[],
  templateIds: readonly string[],
  errorContext: string
): ScaffoldTemplate[] {
  if (templateIds.length === 0) {
    return [];
  }

  const templateById = new Map(
    allTemplates.map((template) => [template.id, template] as const)
  );
  const selectedIds = new Set<string>();
  const pendingIds = [...templateIds];
  while (pendingIds.length > 0) {
    const templateId = pendingIds.pop();
    if (!templateId || selectedIds.has(templateId)) {
      continue;
    }
    const template = templateById.get(templateId);
    if (!template) {
      throw new Error(
        `No scaffold templates could be resolved for plugin "${descriptor.key}" (${errorContext}).`
      );
    }
    selectedIds.add(templateId);
    for (const requiredId of template.requires) {
      pendingIds.push(requiredId);
    }
  }

  const templates = allTemplates.filter((template) =>
    selectedIds.has(template.id)
  );
  if (templates.length === 0) {
    throw new Error(
      `No scaffold templates could be resolved for plugin "${descriptor.key}" (${errorContext}).`
    );
  }
  return templates;
}

export function resolveTemplatesByIdOrThrow(
  descriptor: PluginDescriptor,
  allTemplates: readonly ScaffoldTemplate[],
  templateIds: readonly string[],
  errorContext: string
): ScaffoldTemplate[] {
  return resolveTemplateSelectionWithDependencies(
    descriptor,
    allTemplates,
    templateIds,
    errorContext
  );
}

export function filterScaffoldTemplatePathMap(
  templatePathMap: Record<string, string>,
  allowedTemplateIds: readonly string[]
): Record<string, string> {
  if (allowedTemplateIds.length === 0) {
    return {};
  }
  const allowed = new Set(allowedTemplateIds.map((templateId) => templateId));
  return Object.fromEntries(
    Object.entries(templatePathMap).filter(([templateId]) =>
      allowed.has(templateId)
    )
  );
}

export function resolveAddTemplateDefaults(params: {
  presetArg?: string;
  lockfileTemplateIds: readonly string[];
  presetTemplateIds: readonly string[];
  availableTemplateIds: readonly string[];
}): string[] {
  const availableTemplateIdSet = new Set(
    params.availableTemplateIds.map((id) => id.trim())
  );
  const normalizeTemplateIds = (templateIds: readonly string[]) =>
    [...new Set(templateIds.map((id) => id.trim()))].filter(
      (id) => id.length > 0 && availableTemplateIdSet.has(id)
    );
  const lockfileTemplateIds = normalizeTemplateIds(params.lockfileTemplateIds);
  const presetTemplateIds = normalizeTemplateIds(params.presetTemplateIds);
  const sourceTemplateIds =
    typeof params.presetArg === 'string'
      ? presetTemplateIds
      : lockfileTemplateIds.length > 0
        ? lockfileTemplateIds
        : presetTemplateIds;
  return sourceTemplateIds;
}

export async function promptForScaffoldTemplateSelection(
  promptAdapter: PromptAdapter,
  descriptor: PluginDescriptor,
  allTemplates: readonly ScaffoldTemplate[],
  presetTemplateIds: readonly string[],
  roots: ResolvedScaffoldRoots
): Promise<string[]> {
  const selected = await promptAdapter.multiselect({
    message: `Select scaffold files for plugin "${descriptor.key}". Space to toggle. Enter to submit.`,
    options: allTemplates.map((template) => ({
      value: template.id,
      label: normalizePath(
        relative(
          process.cwd(),
          join(
            template.target === 'lib'
              ? roots.libRootDir
              : roots.functionsRootDir,
            template.path
          )
        )
      ),
    })),
    initialValues: presetTemplateIds,
    required: true,
  });

  if (isCancel(selected)) {
    throw new Error('Scaffold file selection cancelled.');
  }

  const selectedIds = [
    ...new Set((selected as string[]).map((id) => id.trim())),
  ].filter((id) => id.length > 0);
  if (selectedIds.length === 0) {
    throw new Error(
      `No scaffold files selected for plugin "${descriptor.key}". Select at least one scaffold file.`
    );
  }
  return selectedIds;
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

function normalizeLockfileScaffoldPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  if (value.includes('\0') || isAbsolute(value)) {
    return null;
  }
  const normalized = posix.normalize(value.replace(/\\/g, '/'));
  if (
    normalized.length === 0 ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('/')
  ) {
    return null;
  }
  return normalized;
}

const DEFAULT_ENV_HELPER_BASENAME = 'get-env.ts';
const BASE_ENV_FIELDS: readonly PluginEnvField[] = [
  {
    key: 'DEPLOY_ENV',
    schema: "z.string().default('production')",
  },
  {
    key: 'SITE_URL',
    schema: "z.string().default('http://localhost:3000')",
  },
];
const ENV_SCHEMA_RE = /(const\s+\w+\s*=\s*z\.object\(\{\n)([\s\S]*?)(\n\}\);)/m;

function resolveDefaultEnvHelperPath(config: BetterConvexConfig): string {
  return normalizePath(
    posix.join(
      normalizeRelativePathOrThrow(config.paths.lib, 'paths.lib'),
      DEFAULT_ENV_HELPER_BASENAME
    )
  );
}

function resolveConfigWritePath(configPathArg?: string): string {
  return resolve(process.cwd(), configPathArg ?? 'concave.json');
}

function resolveEnvHelperFilePath(envPath: string): string {
  const normalized = normalizeRelativePathOrThrow(envPath, 'paths.env');
  const resolved = resolve(process.cwd(), normalized);
  if (fs.existsSync(resolved) || resolved.endsWith('.ts')) {
    return resolved;
  }
  return `${resolved}.ts`;
}

function renderEnvHelperContent(
  envFields: readonly PluginEnvField[],
  existingContent?: string
): string {
  const fields = [...BASE_ENV_FIELDS];
  for (const field of envFields) {
    if (!fields.some((existing) => existing.key === field.key)) {
      fields.push(field);
    }
  }

  if (!existingContent) {
    const fieldLines = fields
      .map((field) => `  ${field.key}: ${field.schema},`)
      .join('\n');
    return `import { createEnv } from 'better-convex/server';\nimport { z } from 'zod';\n\nconst envSchema = z.object({\n${fieldLines}\n});\n\nexport const getEnv = createEnv({\n  schema: envSchema,\n});\n`;
  }

  const match = existingContent.match(ENV_SCHEMA_RE);
  if (!match) {
    throw new Error(
      'Expected env helper to define `const envSchema = z.object({ ... });`.'
    );
  }

  const existingBody = match[2];
  const missingFieldLines = fields
    .filter((field) => {
      const fieldPattern = new RegExp(`(^|\\n)\\s*${field.key}\\s*:`, 'm');
      return !fieldPattern.test(existingBody);
    })
    .map((field) => `  ${field.key}: ${field.schema},`);

  if (missingFieldLines.length === 0) {
    return existingContent;
  }

  const nextBody = `${existingBody}${existingBody.endsWith('\n') ? '' : '\n'}${missingFieldLines.join('\n')}`;
  return existingContent.replace(
    ENV_SCHEMA_RE,
    `${match[1]}${nextBody}${match[3]}`
  );
}

function renderConfigWithEnvPath(
  configPath: string,
  config: BetterConvexConfig,
  envPath: string
): string {
  const existingRaw = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
    : {};
  if (!isPlainObject(existingRaw)) {
    throw new Error(`Invalid config file ${configPath}: expected object.`);
  }

  const nextRoot = { ...existingRaw } as Record<string, unknown>;
  const nextMeta = isPlainObject(nextRoot.meta) ? { ...nextRoot.meta } : {};
  const nextBetterConvex = isPlainObject(nextMeta['better-convex'])
    ? { ...(nextMeta['better-convex'] as Record<string, unknown>) }
    : {};
  const nextPaths = isPlainObject(nextBetterConvex.paths)
    ? { ...(nextBetterConvex.paths as Record<string, unknown>) }
    : {};

  nextPaths.lib = config.paths.lib;
  nextPaths.shared = config.paths.shared;
  nextPaths.env = envPath;

  nextBetterConvex.paths = nextPaths;
  nextMeta['better-convex'] = nextBetterConvex;
  nextRoot.meta = nextMeta;

  return `${JSON.stringify(nextRoot, null, 2)}\n`;
}

function buildEnvBootstrapFiles(
  config: BetterConvexConfig,
  configPathArg: string | undefined,
  envFields: readonly PluginEnvField[]
): {
  config: BetterConvexConfig;
  files: ScaffoldFile[];
} {
  const envPath = config.paths.env ?? resolveDefaultEnvHelperPath(config);
  const nextConfig = config.paths.env
    ? config
    : {
        ...config,
        paths: {
          ...config.paths,
          env: envPath,
        },
      };

  const envFilePath = resolveEnvHelperFilePath(envPath);
  const envFileContent = renderEnvHelperContent(
    envFields,
    fs.existsSync(envFilePath)
      ? fs.readFileSync(envFilePath, 'utf8')
      : undefined
  );

  const files: ScaffoldFile[] = [
    {
      templateId: '__better-convex-env__',
      filePath: envFilePath,
      lockfilePath: normalizePath(relative(process.cwd(), envFilePath)),
      content: envFileContent,
    },
  ];

  if (!config.paths.env) {
    const configFilePath = resolveConfigWritePath(configPathArg);
    files.unshift({
      templateId: '__better-convex-config__',
      filePath: configFilePath,
      lockfilePath: normalizePath(relative(process.cwd(), configFilePath)),
      content: renderConfigWithEnvPath(configFilePath, nextConfig, envPath),
    });
  }

  return {
    config: nextConfig,
    files,
  };
}

type PackageManager = 'bun' | 'pnpm' | 'yarn' | 'npm';

type DependencyInstallPlan = {
  packageManager: PackageManager;
  command: string;
  args: string[];
  packages: string[];
  cwd: string;
};

type InitializationPlan = {
  config: BetterConvexConfig;
  functionsDir: string;
  files: PluginInstallPlanFile[];
  operations: PluginInstallPlanOperation[];
  dependencyInstall: DependencyInstallPlan | null;
  initialized: boolean;
};

export function resolveSupportedInitTemplate(
  template?: string
): string | undefined {
  if (!template) {
    return undefined;
  }
  if (template !== DEFAULT_INIT_TEMPLATE) {
    throw new Error(
      `Unsupported init template "${template}". Only "${DEFAULT_INIT_TEMPLATE}" is currently supported.`
    );
  }
  return template;
}

export function resolveInitTargetCwd(args: InitCommandArgs): string {
  if (args.cwd) {
    return resolve(process.cwd(), args.cwd);
  }
  if (args.name) {
    return resolve(process.cwd(), args.name);
  }
  return process.cwd();
}

export function resolveInitProjectDir(args: InitCommandArgs): string {
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

function inferInitNextUsesSrcFromComponentsJson(): boolean | null {
  const componentsConfigPath = resolve(process.cwd(), 'components.json');
  if (!fs.existsSync(componentsConfigPath)) {
    return null;
  }

  const raw = JSON.parse(fs.readFileSync(componentsConfigPath, 'utf8')) as {
    tailwind?: { css?: unknown };
  };
  const tailwindCss = raw.tailwind?.css;
  if (typeof tailwindCss !== 'string') {
    return null;
  }
  if (tailwindCss.startsWith('src/')) {
    return true;
  }
  if (tailwindCss.startsWith('app/')) {
    return false;
  }
  return null;
}

function inferInitNextUsesSrcFromAppDirs(): boolean | null {
  const hasRootApp = fs.existsSync(resolve(process.cwd(), 'app'));
  const hasSrcApp = fs.existsSync(resolve(process.cwd(), 'src', 'app'));

  if (hasRootApp && hasSrcApp) {
    throw new Error(
      'Ambiguous Next scaffold roots: both app and src/app exist.'
    );
  }
  if (hasSrcApp) {
    return true;
  }
  if (hasRootApp) {
    return false;
  }
  return null;
}

function inferInitNextUsesSrcFromComponentRoots(): boolean | null {
  const hasRootComponents = fs.existsSync(resolve(process.cwd(), 'components'));
  const hasSrcComponents = fs.existsSync(
    resolve(process.cwd(), 'src', 'components')
  );
  const hasRootLib = fs.existsSync(resolve(process.cwd(), 'lib'));
  const hasSrcLib = fs.existsSync(resolve(process.cwd(), 'src', 'lib'));

  if ((hasRootComponents && hasSrcComponents) || (hasRootLib && hasSrcLib)) {
    throw new Error(
      'Ambiguous Next scaffold roots: both src and root client directories exist.'
    );
  }

  const signals = new Set<boolean>();
  if (hasRootComponents || hasRootLib) {
    signals.add(false);
  }
  if (hasSrcComponents || hasSrcLib) {
    signals.add(true);
  }

  if (signals.size > 1) {
    throw new Error(
      'Ambiguous Next scaffold roots: conflicting src and root client directories exist.'
    );
  }

  return signals.values().next().value ?? null;
}

function inferInitNextUsesSrcFromTsconfig(): boolean | null {
  const tsconfigPath = resolve(process.cwd(), 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {
    return null;
  }

  const raw = fs.readFileSync(tsconfigPath, 'utf8');
  const match = raw.match(INIT_NEXT_TSCONFIG_ALIAS_RE);
  const aliasPath = match?.[1];

  if (aliasPath === './src/*') {
    return true;
  }
  if (aliasPath === './*') {
    return false;
  }
  return null;
}

function resolveInitNextScaffoldContext(): InitNextScaffoldContext {
  const signals = [
    inferInitNextUsesSrcFromComponentsJson(),
    inferInitNextUsesSrcFromAppDirs(),
    inferInitNextUsesSrcFromComponentRoots(),
    inferInitNextUsesSrcFromTsconfig(),
  ].filter((value): value is boolean => value !== null);

  const distinct = [...new Set(signals)];
  if (distinct.length > 1) {
    throw new Error(
      'Ambiguous Next scaffold roots: conflicting src and root project signals exist.'
    );
  }

  const usesSrc = distinct[0] ?? false;
  const rootPrefix = usesSrc ? 'src' : '';
  const appDir = normalizePath(posix.join(rootPrefix, 'app'));
  const componentsDir = normalizePath(posix.join(rootPrefix, 'components'));
  const libDir = normalizePath(posix.join(rootPrefix, 'lib'));

  return {
    usesSrc,
    appDir,
    componentsDir,
    libDir,
    convexClientDir: normalizePath(posix.join(libDir, 'convex')),
    tailwindCssPath: normalizePath(posix.join(appDir, 'globals.css')),
    tsconfigAliasPath: usesSrc ? './src/*' : './*',
  };
}

function buildInitNextOwnedScaffoldFiles(
  context: InitNextScaffoldContext
): readonly InitOwnedTemplateScaffoldFile[] {
  return [
    {
      kind: 'config',
      relativePath: 'package.json',
      content: ({ existingContent }) =>
        renderInitNextPackageJsonTemplate(existingContent),
      createReason:
        'Create baseline package.json scripts for the Next scaffold.',
      updateReason: 'Update package.json scripts for the Next scaffold.',
      skipReason: 'package.json scripts already match the Next scaffold.',
    },
    {
      kind: 'env',
      relativePath: '.env.local',
      content: ({ existingContent }) =>
        renderInitNextEnvLocalTemplate(existingContent),
      createReason: 'Create baseline .env.local for the Next scaffold.',
      updateReason: 'Update baseline .env.local for the Next scaffold.',
      skipReason: '.env.local already matches the Next scaffold.',
    },
    {
      kind: 'scaffold',
      relativePath: `${context.componentsDir}/providers.tsx`,
      content: INIT_NEXT_PROVIDERS_TEMPLATE,
      createReason: `Create baseline ${context.componentsDir}/providers.tsx for the Next scaffold.`,
      updateReason: `Update ${context.componentsDir}/providers.tsx for the Next scaffold.`,
      skipReason: `${context.componentsDir}/providers.tsx already matches the Next scaffold.`,
    },
    {
      kind: 'scaffold',
      relativePath: `${context.convexClientDir}/query-client.ts`,
      content: INIT_NEXT_QUERY_CLIENT_TEMPLATE,
      createReason: `Create baseline ${context.convexClientDir}/query-client.ts for the Next scaffold.`,
      updateReason: `Update ${context.convexClientDir}/query-client.ts for the Next scaffold.`,
      skipReason: `${context.convexClientDir}/query-client.ts already matches the Next scaffold.`,
    },
    {
      kind: 'scaffold',
      relativePath: `${context.convexClientDir}/crpc.tsx`,
      content: INIT_NEXT_CLIENT_CRPC_TEMPLATE,
      createReason: `Create baseline ${context.convexClientDir}/crpc.tsx for the Next scaffold.`,
      updateReason: `Update ${context.convexClientDir}/crpc.tsx for the Next scaffold.`,
      skipReason: `${context.convexClientDir}/crpc.tsx already matches the Next scaffold.`,
    },
    {
      kind: 'scaffold',
      relativePath: `${context.convexClientDir}/convex-provider.tsx`,
      content: INIT_NEXT_CONVEX_PROVIDER_TEMPLATE,
      createReason: `Create baseline ${context.convexClientDir}/convex-provider.tsx for the Next scaffold.`,
      updateReason: `Update ${context.convexClientDir}/convex-provider.tsx for the Next scaffold.`,
      skipReason: `${context.convexClientDir}/convex-provider.tsx already matches the Next scaffold.`,
    },
    {
      kind: 'scaffold',
      relativePath: `${context.convexClientDir}/server.ts`,
      content: INIT_NEXT_SERVER_TEMPLATE,
      createReason: `Create baseline ${context.convexClientDir}/server.ts for the Next scaffold.`,
      updateReason: `Update ${context.convexClientDir}/server.ts for the Next scaffold.`,
      skipReason: `${context.convexClientDir}/server.ts already matches the Next scaffold.`,
    },
    {
      kind: 'scaffold',
      relativePath: `${context.convexClientDir}/rsc.tsx`,
      content: INIT_NEXT_RSC_TEMPLATE,
      createReason: `Create baseline ${context.convexClientDir}/rsc.tsx for the Next scaffold.`,
      updateReason: `Update ${context.convexClientDir}/rsc.tsx for the Next scaffold.`,
      skipReason: `${context.convexClientDir}/rsc.tsx already matches the Next scaffold.`,
    },
  ] as const;
}

function detectImportQuote(source: string): '"' | "'" {
  const match = source.match(INIT_NEXT_IMPORT_QUOTE_RE);
  return match?.[1] === "'" ? "'" : '"';
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

function patchInitNextTsconfigContent(
  source: string,
  context: InitNextScaffoldContext
): string {
  let parsed: unknown;

  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(
      'Could not patch tsconfig.json: expected valid JSON output from the Next scaffold.'
    );
  }

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
        paths,
      },
    },
    null,
    2
  )}\n`;
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
    content: patchInitNextTsconfigContent(
      fs.readFileSync(filePath, 'utf8'),
      context
    ),
    updateReason:
      'Patch tsconfig.json to keep the shadcn alias and add @convex/*.',
    createReason:
      'Patch tsconfig.json to keep the shadcn alias and add @convex/*.',
    skipReason: 'tsconfig.json already includes the Better Convex alias.',
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

function resolveBootstrapFunctionsDirRelative(): string {
  return resolveExistingFunctionsDirRelative() ?? 'convex/functions';
}

function renderInitTemplateContent(params: {
  template: string;
  filePath: string;
  functionsDir: string;
  crpcFilePath: string;
}): string {
  const { template, filePath, functionsDir, crpcFilePath } = params;
  return template
    .replaceAll(
      FUNCTIONS_DIR_IMPORT_PLACEHOLDER,
      resolveFunctionsDirImportPrefix(filePath, functionsDir)
    )
    .replaceAll(
      PROJECT_CRPC_IMPORT_PLACEHOLDER,
      resolveProjectCrpcImportPrefix(filePath, crpcFilePath)
    );
}

function buildTemplateInitializationPlanFiles(params: {
  template?: string;
}): PluginInstallPlanFile[] {
  if (params.template !== DEFAULT_INIT_TEMPLATE) {
    return [];
  }

  const context = resolveInitNextScaffoldContext();
  const ownedFiles = buildInitNextOwnedScaffoldFiles(context).map((file) => {
    const filePath = resolve(process.cwd(), file.relativePath);
    const existingContent = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf8')
      : undefined;
    const content =
      typeof file.content === 'function'
        ? file.content({ existingContent })
        : file.content;

    return createPlanFile({
      kind: file.kind,
      filePath,
      content,
      createReason: file.createReason,
      updateReason: file.updateReason,
      skipReason: file.skipReason,
    });
  });

  return [
    ...ownedFiles,
    buildInitNextTsconfigPlanFile(context),
    buildInitNextComponentsJsonPlanFile(context),
    buildInitNextLayoutPlanFile(context),
  ];
}

function detectPackageManager(projectDir: string): PackageManager {
  const packageJsonPath = join(projectDir, 'package.json');
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
    fs.existsSync(join(projectDir, 'bun.lock')) ||
    fs.existsSync(join(projectDir, 'bun.lockb'))
  ) {
    return 'bun';
  }
  if (fs.existsSync(join(projectDir, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(join(projectDir, 'yarn.lock'))) {
    return 'yarn';
  }
  if (fs.existsSync(join(projectDir, 'package-lock.json'))) {
    return 'npm';
  }
  return 'bun';
}

function buildDependencyInstallPlan(
  projectDir: string,
  packages: readonly string[]
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
  const missing = packages.filter((packageName) => !(packageName in existing));
  if (missing.length === 0) {
    return null;
  }

  const packageManager = detectPackageManager(projectDir);
  const args =
    packageManager === 'npm' ? ['install', ...missing] : ['add', ...missing];

  return {
    packageManager,
    command: packageManager,
    args,
    packages: missing,
    cwd: projectDir,
  };
}

function getCrpcFilePath(config: BetterConvexConfig): string {
  const libDir = normalizeRelativePathOrThrow(config.paths.lib, 'paths.lib');
  return resolve(process.cwd(), libDir, 'crpc.ts');
}

function getHttpFilePath(functionsDir: string): string {
  return join(functionsDir, 'http.ts');
}

export function isBetterConvexInitialized(params: {
  functionsDir: string;
  config: BetterConvexConfig;
}): boolean {
  return (
    fs.existsSync(getSchemaFilePath(params.functionsDir)) &&
    fs.existsSync(getHttpFilePath(params.functionsDir)) &&
    fs.existsSync(getCrpcFilePath(params.config))
  );
}

export function buildInitializationPlan(params: {
  config: BetterConvexConfig;
  configPathArg?: string;
  envFields?: readonly PluginEnvField[];
  template?: string;
}): InitializationPlan {
  const functionsDirRelative = resolveBootstrapFunctionsDirRelative();
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
  const files: PluginInstallPlanFile[] = [];
  const templateFiles = buildTemplateInitializationPlanFiles({
    template: params.template,
  });

  if (functionsDirRelative !== 'convex' || fs.existsSync(convexConfigPath)) {
    files.push(
      createPlanFile({
        kind: 'config',
        filePath: convexConfigPath,
        content: INIT_CONVEX_CONFIG_TEMPLATE,
        createReason: 'Create Convex config for functions bootstrap.',
        updateReason: 'Update Convex config for Better Convex bootstrap.',
        skipReason: 'Convex config is already bootstrapped.',
      })
    );
  }

  files.push(
    ...envBootstrap.files.map((file) =>
      createPlanFile({
        kind: file.templateId === '__better-convex-config__' ? 'config' : 'env',
        templateId: file.templateId,
        filePath: file.filePath,
        content: file.content,
        createReason:
          file.templateId === '__better-convex-config__'
            ? 'Create Better Convex config.'
            : 'Create typed env helper.',
        updateReason:
          file.templateId === '__better-convex-config__'
            ? 'Update Better Convex config.'
            : 'Update typed env helper.',
        skipReason:
          file.templateId === '__better-convex-config__'
            ? 'Better Convex config is already bootstrapped.'
            : 'Typed env helper is already bootstrapped.',
      })
    )
  );

  files.push(
    createPlanFile({
      kind: 'schema',
      filePath: schemaFilePath,
      content: INIT_SCHEMA_TEMPLATE,
      createReason: 'Create baseline schema.ts.',
      updateReason: 'Update baseline schema.ts.',
      skipReason: 'Baseline schema.ts is already bootstrapped.',
    }),
    createPlanFile({
      kind: 'scaffold',
      filePath: crpcFilePath,
      content: renderInitTemplateContent({
        template: INIT_CRPC_TEMPLATE,
        filePath: crpcFilePath,
        functionsDir,
        crpcFilePath,
      }),
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
      createReason: 'Create baseline http.ts.',
      updateReason: 'Update baseline http.ts.',
      skipReason: 'Baseline http.ts is already bootstrapped.',
    })
  );

  files.push(...templateFiles);

  const dependencyPackages =
    params.template === DEFAULT_INIT_TEMPLATE
      ? [...BASELINE_DEPENDENCIES, ...INIT_NEXT_TEMPLATE_DEPENDENCIES]
      : [...BASELINE_DEPENDENCIES];
  const dependencyInstall = buildDependencyInstallPlan(
    process.cwd(),
    dependencyPackages
  );
  const operations: PluginInstallPlanOperation[] = [];
  if (dependencyInstall) {
    operations.push({
      kind: 'dependency_install',
      status: 'pending',
      reason: 'Install baseline Better Convex dependencies.',
      command: `${dependencyInstall.command} ${dependencyInstall.args.join(' ')}`,
    });
  }

  return {
    config: nextConfig,
    functionsDir,
    files,
    operations,
    dependencyInstall,
    initialized: isBetterConvexInitialized({
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

export async function runInitCommandFlow(params: {
  initArgs: InitCommandArgs;
  backendArg?: BetterConvexBackend;
  configPath?: string;
  execaFn: typeof execa;
  generateMetaFn: typeof generateMeta;
  loadBetterConvexConfigFn: typeof loadBetterConvexConfig;
  ensureConvexGitignoreEntryFn: typeof ensureConvexGitignoreEntry;
  promptAdapter: PromptAdapter;
  realConvexPath: string;
  realConcavePath?: string;
}): Promise<InitRunResult> {
  const template = resolveSupportedInitTemplate(params.initArgs.template);
  const projectDir = template
    ? resolveInitProjectDir(params.initArgs)
    : resolveInitTargetCwd(params.initArgs);
  const usedShadcn = template !== undefined;

  if (usedShadcn) {
    await createProjectWithShadcn({
      projectDir,
      template,
      yes: params.initArgs.yes,
      defaults: params.initArgs.defaults,
      execaFn: params.execaFn,
    });
  }

  return withWorkingDirectory(projectDir, async () => {
    const config = params.loadBetterConvexConfigFn(params.configPath);
    const backend = resolveConfiguredBackend({
      backendArg: params.backendArg,
      config,
    });
    const initPlan = buildInitializationPlan({
      config,
      configPathArg: params.configPath,
      template,
    });
    const applyResult = await applyPluginInstallPlanFiles(initPlan.files, {
      overwrite: params.initArgs.yes || params.initArgs.defaults,
      yes: params.initArgs.yes || params.initArgs.defaults,
      promptAdapter: params.promptAdapter,
    });
    await applyDependencyInstallPlan(
      initPlan.dependencyInstall,
      params.execaFn
    );

    try {
      params.ensureConvexGitignoreEntryFn(process.cwd());
    } catch (error) {
      logger.warn(
        `⚠️  Failed to ensure .convex/ is ignored in .gitignore: ${(error as Error).message}`
      );
    }

    const codegenResult = await runInitializationCodegen({
      config: initPlan.config,
      backend,
      sharedDir: initPlan.config.paths.shared,
      debug: initPlan.config.codegen.debug,
      generateMetaFn: params.generateMetaFn,
      execaFn: params.execaFn,
      realConvexPath: params.realConvexPath,
      realConcavePath: params.realConcavePath,
      functionsDir: initPlan.functionsDir,
      template,
      team: params.initArgs.team,
      project: params.initArgs.project,
      devDeployment: params.initArgs.devDeployment,
    });

    return {
      backend,
      cwd: projectDir,
      created: applyResult.created,
      updated: applyResult.updated,
      skipped: applyResult.skipped,
      usedShadcn,
      template: template ?? null,
      codegen: codegenResult.codegen,
      convexBootstrap: codegenResult.convexBootstrap,
    };
  });
}

function resolvePluginEnvReminders(
  functionsDir: string,
  envFields: readonly PluginEnvField[]
): PluginEnvReminder[] {
  const envPath = normalizePath(
    relative(process.cwd(), join(functionsDir, '.env'))
  );
  return envFields.flatMap((field) =>
    field.reminder
      ? [
          {
            key: field.key,
            path: envPath,
            message: field.reminder.message,
          } satisfies PluginEnvReminder,
        ]
      : []
  );
}

export function resolvePluginScaffoldRoots(
  functionsDir: string,
  descriptor: PluginDescriptor,
  config: ReturnType<typeof loadBetterConvexConfig>
): ResolvedScaffoldRoots {
  const libDir = normalizeRelativePathOrThrow(config.paths.lib, 'paths.lib');
  const libRoot = resolve(process.cwd(), libDir);
  return {
    functionsRootDir: join(functionsDir, 'plugins'),
    libRootDir: join(libRoot, 'plugins', descriptor.key),
    crpcFilePath: join(libRoot, 'crpc.ts'),
    sharedApiFilePath: resolve(process.cwd(), config.paths.shared, 'api.ts'),
    envFilePath: resolveEnvHelperFilePath(
      config.paths.env ?? resolveDefaultEnvHelperPath(config)
    ),
  };
}

function resolvePluginScaffoldFiles(
  templates: readonly ScaffoldTemplate[],
  roots: ResolvedScaffoldRoots,
  functionsDir: string,
  existingTemplatePathMap?: Record<string, string>
): ScaffoldFile[] {
  return templates.map((template) => {
    const rootDir =
      template.target === 'lib' ? roots.libRootDir : roots.functionsRootDir;
    const mappedLockfilePath = existingTemplatePathMap?.[template.id];
    const resolvedLockfilePath =
      normalizeLockfileScaffoldPath(mappedLockfilePath);
    const lockfilePath =
      resolvedLockfilePath ??
      normalizePath(relative(process.cwd(), join(rootDir, template.path)));
    const filePath = resolve(process.cwd(), lockfilePath);
    const getEnvImportPath = resolveProjectGetEnvImportPrefix(
      filePath,
      roots.envFilePath
    );
    const content = template.content
      .replaceAll(
        FUNCTIONS_DIR_IMPORT_PLACEHOLDER,
        resolveFunctionsDirImportPrefix(filePath, functionsDir)
      )
      .replaceAll(
        PROJECT_CRPC_IMPORT_PLACEHOLDER,
        resolveProjectCrpcImportPrefix(filePath, roots.crpcFilePath)
      )
      .replaceAll(
        PROJECT_SHARED_API_IMPORT_PLACEHOLDER,
        resolveProjectSharedApiImportPrefix(filePath, roots.sharedApiFilePath)
      )
      .replaceAll(
        PROJECT_GET_ENV_IMPORT_PLACEHOLDER,
        `import { getEnv } from '${getEnvImportPath}';`
      )
      .replaceAll(
        PLUGIN_CONFIG_IMPORT_PLACEHOLDER,
        resolvePluginConfigImportPrefix(filePath, roots.libRootDir)
      )
      .replaceAll(
        PLUGIN_SCHEMA_IMPORT_PLACEHOLDER,
        resolvePluginSchemaImportPrefix(filePath, roots.libRootDir)
      );

    if (content.includes('process.env')) {
      throw new Error(
        `Scaffold template "${template.id}" contains process.env. Use getEnv() instead.`
      );
    }

    return {
      templateId: template.id,
      filePath,
      lockfilePath,
      content,
    };
  });
}

function resolveFunctionsDirImportPrefix(
  filePath: string,
  functionsDir: string
): string {
  const relativePath = normalizePath(relative(dirname(filePath), functionsDir));
  if (relativePath.length === 0 || relativePath === '.') {
    return '.';
  }
  if (relativePath.startsWith('.')) {
    return relativePath;
  }
  return `./${relativePath}`;
}

function resolvePluginConfigImportPrefix(
  filePath: string,
  libPluginRootDir: string
): string {
  return resolveRelativeImportPath(
    filePath,
    join(libPluginRootDir, 'plugin.ts')
  );
}

function resolvePluginSchemaImportPrefix(
  filePath: string,
  libPluginRootDir: string
): string {
  return resolveRelativeImportPath(
    filePath,
    join(libPluginRootDir, 'schema.ts')
  );
}

function resolveProjectCrpcImportPrefix(
  filePath: string,
  projectCrpcFilePath: string
): string {
  return resolveRelativeImportPath(filePath, projectCrpcFilePath);
}

function resolveProjectSharedApiImportPrefix(
  filePath: string,
  sharedApiFilePath: string
): string {
  return resolveRelativeImportPath(filePath, sharedApiFilePath);
}

function resolveProjectGetEnvImportPrefix(
  filePath: string,
  getEnvFilePath: string
): string {
  return resolveRelativeImportPath(filePath, getEnvFilePath);
}

function resolveRelativeImportPath(
  filePath: string,
  targetFilePath: string
): string {
  const relativePath = normalizePath(
    relative(dirname(filePath), targetFilePath)
  ).replace(TS_EXTENSION_RE, '');
  if (relativePath.length === 0 || relativePath === '.') {
    return '.';
  }
  if (relativePath.startsWith('.')) {
    return relativePath;
  }
  return `./${relativePath}`;
}

export function readPluginLockfile(lockfilePath: string): PluginLockfile {
  if (!fs.existsSync(lockfilePath)) {
    return {
      plugins: {},
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        plugins: {},
      };
    }
    const rawPlugins = (parsed as { plugins?: unknown }).plugins;
    if (
      !rawPlugins ||
      typeof rawPlugins !== 'object' ||
      Array.isArray(rawPlugins)
    ) {
      return {
        plugins: {},
      };
    }
    const plugins: PluginLockfile['plugins'] = {};
    for (const [pluginKey, pluginEntry] of Object.entries(
      rawPlugins as Record<string, unknown>
    ).sort(([a], [b]) => a.localeCompare(b))) {
      if (
        !pluginEntry ||
        typeof pluginEntry !== 'object' ||
        Array.isArray(pluginEntry)
      ) {
        continue;
      }
      const packageName = (pluginEntry as { package?: unknown }).package;
      if (typeof packageName !== 'string' || packageName.length === 0) {
        continue;
      }
      const rawFiles = (pluginEntry as { files?: unknown }).files;
      const normalizedFiles: Record<string, string> = {};
      if (
        rawFiles &&
        typeof rawFiles === 'object' &&
        !Array.isArray(rawFiles)
      ) {
        for (const [templateId, templatePath] of Object.entries(
          rawFiles as Record<string, unknown>
        ).sort(([a], [b]) => a.localeCompare(b))) {
          const normalizedPath = normalizeLockfileScaffoldPath(templatePath);
          if (normalizedPath) {
            normalizedFiles[templateId] = normalizedPath;
          }
        }
      }
      plugins[pluginKey] =
        Object.keys(normalizedFiles).length > 0
          ? { package: packageName, files: normalizedFiles }
          : { package: packageName };
    }
    return {
      plugins,
    };
  } catch {
    return {
      plugins: {},
    };
  }
}

function renderPluginLockfileContent(lockfile: PluginLockfile): string {
  const normalizedPlugins: PluginLockfile['plugins'] = {};
  for (const plugin of Object.keys(lockfile.plugins).sort((a, b) =>
    a.localeCompare(b)
  )) {
    const pluginEntry = lockfile.plugins[plugin];
    if (
      !pluginEntry ||
      typeof pluginEntry.package !== 'string' ||
      pluginEntry.package.length === 0
    ) {
      continue;
    }
    const normalizedFiles: Record<string, string> = {};
    const rawFiles = pluginEntry?.files;
    if (rawFiles && typeof rawFiles === 'object' && !Array.isArray(rawFiles)) {
      for (const [templateId, templatePath] of Object.entries(rawFiles).sort(
        ([a], [b]) => a.localeCompare(b)
      )) {
        const normalizedPath = normalizeLockfileScaffoldPath(templatePath);
        if (normalizedPath) {
          normalizedFiles[templateId] = normalizedPath;
        }
      }
    }
    normalizedPlugins[plugin] =
      Object.keys(normalizedFiles).length > 0
        ? { package: pluginEntry.package, files: normalizedFiles }
        : { package: pluginEntry.package };
  }
  return `${JSON.stringify(
    {
      plugins: normalizedPlugins,
    },
    null,
    2
  )}\n`;
}

export async function resolveSchemaInstalledPlugins(
  functionsDir: string
): Promise<SupportedPlugin[]> {
  const schemaPath = join(functionsDir, 'schema.ts');
  if (!fs.existsSync(schemaPath)) {
    return [];
  }

  const jiti = createJiti(process.cwd(), {
    interopDefault: true,
    moduleCache: false,
  });
  try {
    const schemaModule = await jiti.import(schemaPath);
    const schemaValue =
      schemaModule && typeof schemaModule === 'object'
        ? ((schemaModule as Record<string, unknown>).default ?? schemaModule)
        : null;
    if (!schemaValue || typeof schemaValue !== 'object') {
      return [];
    }
    const plugins = (schemaValue as Record<symbol, unknown>)[
      ORM_SCHEMA_EXTENSIONS
    ];
    if (!Array.isArray(plugins)) {
      return [];
    }
    return plugins
      .map((plugin) =>
        plugin && typeof plugin === 'object' && 'key' in plugin
          ? String((plugin as { key: unknown }).key)
          : ''
      )
      .filter((key): key is SupportedPlugin =>
        SUPPORTED_PLUGINS.has(key as SupportedPlugin)
      )
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export function getSchemaFilePath(functionsDir: string): string {
  return join(functionsDir, 'schema.ts');
}

export function assertSchemaFileExists(functionsDir: string): string {
  const schemaPath = getSchemaFilePath(functionsDir);
  if (!fs.existsSync(schemaPath)) {
    throw new Error(
      `Missing schema file at ${normalizePath(relative(process.cwd(), schemaPath))}. Create schema.ts before installing plugins.`
    );
  }
  return schemaPath;
}

function createPlanFile(params: {
  kind: PlanFileKind;
  filePath: string;
  content: string;
  templateId?: string;
  createReason: string;
  updateReason: string;
  skipReason: string;
}): PluginInstallPlanFile {
  const normalizedPath = normalizePath(
    relative(process.cwd(), params.filePath)
  );
  const exists = fs.existsSync(params.filePath);
  if (!exists) {
    return {
      kind: params.kind,
      templateId: params.templateId,
      path: normalizedPath,
      action: 'create',
      reason: params.createReason,
      content: params.content,
    };
  }

  const existingContent = fs.readFileSync(params.filePath, 'utf8');
  if (
    isContentEquivalent({
      filePath: normalizedPath,
      existingContent,
      nextContent: params.content,
    })
  ) {
    return {
      kind: params.kind,
      templateId: params.templateId,
      path: normalizedPath,
      action: 'skip',
      reason: params.skipReason,
      content: params.content,
      existingContent,
    };
  }

  return {
    kind: params.kind,
    templateId: params.templateId,
    path: normalizedPath,
    action: 'update',
    reason: params.updateReason,
    content: params.content,
    existingContent,
  };
}

function getPlannedFileContent(
  files: readonly PluginInstallPlanFile[] | undefined,
  absolutePath: string
): string | undefined {
  const normalizedPath = normalizePath(relative(process.cwd(), absolutePath));
  return files?.find((file) => file.path === normalizedPath)?.content;
}

function buildSchemaRegistrationPlanFile(
  functionsDir: string,
  descriptor: PluginDescriptor,
  roots: ResolvedScaffoldRoots,
  bootstrapFiles?: readonly PluginInstallPlanFile[]
): PluginInstallPlanFile {
  const schemaPath = getSchemaFilePath(functionsDir);
  const bootstrappedSchemaSource = getPlannedFileContent(
    bootstrapFiles,
    schemaPath
  );
  if (!fs.existsSync(schemaPath) && !bootstrappedSchemaSource) {
    assertSchemaFileExists(functionsDir);
  }
  const schemaRegistration = descriptor.schemaRegistration;
  const pluginFactory = schemaRegistration.importName;
  const registrationRoot =
    schemaRegistration.target === 'lib'
      ? roots.libRootDir
      : roots.functionsRootDir;
  const pluginImportPath = resolveRelativeImportPath(
    schemaPath,
    join(registrationRoot, schemaRegistration.path)
  );

  let source = bootstrappedSchemaSource ?? fs.readFileSync(schemaPath, 'utf8');
  if (!source.includes(`${pluginFactory}()`)) {
    const importRegex = new RegExp(
      `import\\s+\\{[^}]*\\b${pluginFactory}\\b[^}]*\\}\\s+from\\s+['"]${pluginImportPath}['"];?`
    );
    if (!importRegex.test(source)) {
      source = `import { ${pluginFactory} } from '${pluginImportPath}';\n${source}`;
    }

    if (CHAIN_EXTEND_RE.test(source)) {
      source = source.replace(
        CHAIN_EXTEND_RE,
        (_match, inner: string) =>
          `.extend(${pluginFactory}(), ${inner.trim()})`
      );
    } else if (CHAIN_RELATIONS_RE.test(source)) {
      source = source.replace(
        CHAIN_RELATIONS_RE,
        `.extend(${pluginFactory}()).relations(`
      );
    } else if (CHAIN_TRIGGERS_RE.test(source)) {
      source = source.replace(
        CHAIN_TRIGGERS_RE,
        `.extend(${pluginFactory}()).triggers(`
      );
    } else if (DEFINE_SCHEMA_CALL_RE.test(source)) {
      source = source.replace(
        DEFINE_SCHEMA_CALL_RE,
        (match: string) => `${match}.extend(${pluginFactory}())`
      );
    }
  }

  return createPlanFile({
    kind: 'schema',
    filePath: schemaPath,
    content: source,
    createReason: 'Create schema.ts with plugin registration.',
    updateReason: `Register ${descriptor.key} in schema.ts.`,
    skipReason: `${descriptor.key} is already registered in schema.ts.`,
  });
}

function buildResendHttpRegistrationPlanFile(params: {
  functionsDir: string;
  roots: ResolvedScaffoldRoots;
}): PluginInstallPlanFile {
  const httpPath = getHttpFilePath(params.functionsDir);
  const resendWebhookImportPath = resolveRelativeImportPath(
    httpPath,
    join(params.roots.libRootDir, 'webhook.ts')
  );
  let source = fs.existsSync(httpPath)
    ? fs.readFileSync(httpPath, 'utf8')
    : renderInitTemplateContent({
        template: INIT_HTTP_TEMPLATE,
        filePath: httpPath,
        functionsDir: params.functionsDir,
        crpcFilePath: params.roots.crpcFilePath,
      });

  if (!source.includes('resendWebhook')) {
    if (source.includes(INIT_HTTP_IMPORT_MARKER)) {
      source = source.replace(
        INIT_HTTP_IMPORT_MARKER,
        `import { resendWebhook } from '${resendWebhookImportPath}';\n${INIT_HTTP_IMPORT_MARKER}`
      );
    }
    if (source.includes(INIT_HTTP_ROUTE_MARKER)) {
      source = source.replace(
        INIT_HTTP_ROUTE_MARKER,
        `  resendWebhook,\n${INIT_HTTP_ROUTE_MARKER}`
      );
    }
  }

  return createPlanFile({
    kind: 'scaffold',
    filePath: httpPath,
    content: source,
    createReason: 'Create http.ts with resend webhook route.',
    updateReason: 'Register resend webhook in http.ts.',
    skipReason: 'Resend webhook is already registered in http.ts.',
  });
}

function buildRatelimitCrpcRegistrationPlanFile(params: {
  config: BetterConvexConfig;
  functionsDir: string;
}): PluginInstallPlanFile {
  const crpcPath = getCrpcFilePath(params.config);
  let source = fs.existsSync(crpcPath)
    ? fs.readFileSync(crpcPath, 'utf8')
    : renderInitTemplateContent({
        template: INIT_CRPC_TEMPLATE,
        filePath: crpcPath,
        functionsDir: params.functionsDir,
        crpcFilePath: crpcPath,
      });

  if (!source.includes("from './plugins/ratelimit/plugin'")) {
    if (source.includes(INIT_CRPC_IMPORT_MARKER)) {
      source = source.replace(
        INIT_CRPC_IMPORT_MARKER,
        `import { type RatelimitBucket, ratelimit } from './plugins/ratelimit/plugin';\n${INIT_CRPC_IMPORT_MARKER}`
      );
    } else {
      source = `import { type RatelimitBucket, ratelimit } from './plugins/ratelimit/plugin';\n${source}`;
    }
  }

  if (CRPC_META_RATELIMIT_RE.test(source)) {
    source = source.replace(
      CRPC_META_RATELIMIT_RE,
      'ratelimit?: RatelimitBucket;'
    );
  }

  if (PUBLIC_MUTATION_LINE_RE.test(source)) {
    source = source.replace(
      PUBLIC_MUTATION_LINE_RE,
      'export const publicMutation = c.mutation.use(ratelimit.middleware());'
    );
  }

  return createPlanFile({
    kind: 'scaffold',
    filePath: crpcPath,
    content: source,
    createReason: 'Create crpc.ts with ratelimit middleware.',
    updateReason: 'Register ratelimit middleware in crpc.ts.',
    skipReason: 'Ratelimit middleware is already registered in crpc.ts.',
  });
}

function buildPluginIntegrationPlanFiles(params: {
  descriptor: PluginDescriptor;
  functionsDir: string;
  roots: ResolvedScaffoldRoots;
  config: BetterConvexConfig;
}): PluginInstallPlanFile[] {
  if (params.descriptor.key === 'resend') {
    return [buildResendHttpRegistrationPlanFile(params)];
  }
  if (params.descriptor.key === 'ratelimit') {
    return [
      buildRatelimitCrpcRegistrationPlanFile({
        config: params.config,
        functionsDir: params.functionsDir,
      }),
    ];
  }
  return [];
}

function createLockfilePlanFile(
  functionsDir: string,
  lockfile: PluginLockfile
): PluginInstallPlanFile {
  const lockfilePath = getPluginLockfilePath(functionsDir);
  return createPlanFile({
    kind: 'lockfile',
    filePath: lockfilePath,
    content: renderPluginLockfileContent(lockfile),
    createReason: 'Create plugin lockfile.',
    updateReason: 'Update plugin lockfile.',
    skipReason: 'Plugin lockfile is already up to date.',
  });
}

export async function buildPluginInstallPlan(params: {
  descriptor: PluginDescriptor;
  selectedPlugin: SupportedPlugin;
  preset: string;
  selectionSource: PlanSelectionSource;
  presetTemplateIds: string[];
  selectedTemplateIds: string[];
  selectedTemplates: readonly ScaffoldTemplate[];
  config: ReturnType<typeof loadBetterConvexConfig>;
  configPathArg?: string;
  functionsDir: string;
  lockfile: PluginLockfile;
  existingTemplatePathMap: Record<string, string>;
  noCodegen: boolean;
  includeEnvBootstrap?: boolean;
  bootstrapFiles?: readonly PluginInstallPlanFile[];
  bootstrapOperations?: readonly PluginInstallPlanOperation[];
}): Promise<PluginInstallPlan> {
  const hasBootstrappedSchema = (params.bootstrapFiles ?? []).some(
    (file) =>
      file.path ===
      normalizePath(
        relative(process.cwd(), getSchemaFilePath(params.functionsDir))
      )
  );
  if (!hasBootstrappedSchema) {
    assertSchemaFileExists(params.functionsDir);
  }
  const envBootstrap =
    params.includeEnvBootstrap === false
      ? {
          config: params.config,
          files: [],
        }
      : buildEnvBootstrapFiles(
          params.config,
          params.configPathArg,
          params.descriptor.envFields ?? []
        );
  const effectiveConfig = envBootstrap.config;
  const roots = resolvePluginScaffoldRoots(
    params.functionsDir,
    params.descriptor,
    effectiveConfig
  );
  const scaffoldFiles = resolvePluginScaffoldFiles(
    params.selectedTemplates,
    roots,
    params.functionsDir,
    params.existingTemplatePathMap
  );
  const dependency = await inspectPluginDependencyInstall({
    descriptor: params.descriptor,
  });
  const dependencyHints = [
    ...new Set(
      params.selectedTemplates.flatMap((template) => template.dependencyHints)
    ),
  ];
  const dependencyHintCommand =
    dependencyHints.length > 0
      ? `bun add ${dependencyHints.join(' ')}`
      : undefined;
  const envReminders = resolvePluginEnvReminders(
    params.functionsDir,
    params.descriptor.envFields ?? []
  );
  const nextSteps = dependencyHintCommand
    ? [`Install scaffold dependencies: ${dependencyHintCommand}`]
    : [];

  const pluginScaffoldPaths = {
    ...params.existingTemplatePathMap,
    ...Object.fromEntries(
      scaffoldFiles.map((file) => [file.templateId, file.lockfilePath])
    ),
  };
  const nextPluginEntry =
    Object.keys(pluginScaffoldPaths).length > 0
      ? {
          package: params.descriptor.packageName,
          files: pluginScaffoldPaths,
        }
      : {
          package: params.descriptor.packageName,
        };
  const nextLockfile: PluginLockfile = {
    plugins: {
      ...params.lockfile.plugins,
      [params.selectedPlugin]: nextPluginEntry,
    },
  };
  const integrationFiles = buildPluginIntegrationPlanFiles({
    descriptor: params.descriptor,
    functionsDir: params.functionsDir,
    roots,
    config: effectiveConfig,
  });

  const fileMap = new Map<string, PluginInstallPlanFile>();
  for (const file of [
    ...(params.bootstrapFiles ?? []),
    ...envBootstrap.files.map((file) =>
      createPlanFile({
        kind: file.templateId === '__better-convex-config__' ? 'config' : 'env',
        templateId: file.templateId,
        filePath: file.filePath,
        content: file.content,
        createReason:
          file.templateId === '__better-convex-config__'
            ? 'Create concave.json with env helper path.'
            : 'Create env helper scaffold.',
        updateReason:
          file.templateId === '__better-convex-config__'
            ? 'Update concave.json with env helper path.'
            : 'Update env helper scaffold.',
        skipReason:
          file.templateId === '__better-convex-config__'
            ? 'concave.json already points at the env helper.'
            : 'Env helper is already up to date.',
      })
    ),
    ...integrationFiles,
    ...scaffoldFiles.map((file) =>
      createPlanFile({
        kind: 'scaffold',
        templateId: file.templateId,
        filePath: file.filePath,
        content: file.content,
        createReason: 'Create scaffold file.',
        updateReason: 'Update scaffold file.',
        skipReason: 'Scaffold file is already up to date.',
      })
    ),
    buildSchemaRegistrationPlanFile(
      params.functionsDir,
      params.descriptor,
      roots,
      params.bootstrapFiles
    ),
    createLockfilePlanFile(params.functionsDir, nextLockfile),
  ]) {
    fileMap.set(file.path, file);
  }
  const files: PluginInstallPlanFile[] = [...fileMap.values()].sort((a, b) =>
    a.path.localeCompare(b.path)
  );

  const operations: PluginInstallPlanOperation[] = [
    ...(params.bootstrapOperations ?? []),
    {
      kind: 'dependency_install',
      status: dependency.skipped ? 'skipped' : 'pending',
      reason:
        dependency.reason === 'already_present'
          ? 'Dependency already installed.'
          : dependency.reason === 'missing_package_json'
            ? 'No package.json found for dependency installation.'
            : `Install ${dependency.packageName}.`,
      path: dependency.packageJsonPath
        ? normalizePath(relative(process.cwd(), dependency.packageJsonPath))
        : undefined,
      packageName: dependency.packageName,
      command:
        dependency.packageName &&
        dependency.packageJsonPath &&
        !dependency.skipped
          ? `bun add ${dependency.packageName}`
          : undefined,
    },
    {
      kind: 'codegen',
      status: params.noCodegen ? 'skipped' : 'pending',
      reason: params.noCodegen
        ? 'Codegen disabled by flag.'
        : 'Run codegen after scaffold changes.',
      command: params.noCodegen ? undefined : 'better-convex codegen',
    },
    ...effectiveConfig.hooks.postAdd.map((script) => ({
      kind: 'post_add_hook' as const,
      status: 'pending' as const,
      reason: 'Run configured post-add hook.',
      command: script,
    })),
    ...envReminders.map((reminder) => ({
      kind: 'env_reminder' as const,
      status: 'pending' as const,
      reason: 'Set required plugin environment variable.',
      path: reminder.path,
      key: reminder.key,
      message: reminder.message,
    })),
  ];

  return {
    plugin: params.selectedPlugin,
    preset: params.preset,
    selectionSource: params.selectionSource,
    presetTemplateIds: params.presetTemplateIds,
    selectedTemplateIds: params.selectedTemplateIds,
    files,
    operations,
    dependencyHints,
    envReminders,
    docs: params.descriptor.docs,
    nextSteps,
    dependency,
  };
}

export function serializePluginInstallPlan(plan: PluginInstallPlan) {
  return {
    ...plan,
    dependency: {
      packageName: plan.dependency.packageName,
      packageJsonPath: plan.dependency.packageJsonPath
        ? normalizePath(
            relative(process.cwd(), plan.dependency.packageJsonPath)
          )
        : undefined,
      installed: plan.dependency.installed,
      skipped: plan.dependency.skipped,
      reason: plan.dependency.reason,
    },
  };
}

export function formatInfoOutput(payload: {
  schemaPlugins: SupportedPlugin[];
  installedPlugins: InstalledPluginState[];
  project: {
    backend: BetterConvexBackend;
    functionsDir: string;
    schemaPath: string;
    schemaExists: boolean;
    lockfilePath: string;
    lockfileExists: boolean;
    packageJsonPath?: string;
    betterConvexVersion?: string;
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
    `${highlighter.bold('┌')} ${highlighter.bold('better-convex info')}`,
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
    `${highlighter.dim('│')} ${highlighter.dim('better-convex')} ${
      payload.project.betterConvexVersion ?? 'unknown'
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
  const lines = [
    `${highlighter.bold('┌')} ${highlighter.bold('better-convex docs')}`,
  ];

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

export function resolveTemplateSelectionSource(params: {
  presetArg?: string;
  lockfileTemplateIds: readonly string[];
}): PlanSelectionSource {
  if (typeof params.presetArg === 'string') {
    return 'preset';
  }
  return params.lockfileTemplateIds.length > 0 ? 'lockfile' : 'preset';
}

export function collectInstalledPluginKeys(
  lockfile: PluginLockfile,
  schemaPlugins: readonly SupportedPlugin[]
): SupportedPlugin[] {
  return [
    ...new Set([
      ...(Object.keys(lockfile.plugins).filter((key) =>
        isSupportedPluginKey(key)
      ) as SupportedPlugin[]),
      ...schemaPlugins,
    ]),
  ].sort((a, b) => a.localeCompare(b));
}

export function readPackageVersions(startDir: string): {
  packageJsonPath?: string;
  betterConvexVersion?: string;
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
    betterConvexVersion: readVersion('better-convex'),
    convexVersion: readVersion('convex'),
  };
}

export function resolveDocTopic(topic: string): CliDocEntry | undefined {
  if (topic in CORE_DOC_TOPICS) {
    return CORE_DOC_TOPICS[topic];
  }
  if (isSupportedPluginKey(topic)) {
    const descriptor = getPluginDescriptor(topic);
    return {
      title: descriptor.label,
      localPath: descriptor.docs.localPath,
      publicUrl: descriptor.docs.publicUrl,
      keywords: descriptor.keywords,
    };
  }
  return undefined;
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
  updated: string[];
  skipped: string[];
}> {
  const result = {
    created: [] as string[],
    updated: [] as string[],
    skipped: [] as string[],
  };

  for (const file of files) {
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

    const requiresConfirmation =
      file.kind === 'config' || file.kind === 'env' || file.kind === 'scaffold';
    let shouldOverwrite = options.overwrite || !requiresConfirmation;
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

  const jiti = createJiti(process.cwd(), {
    interopDefault: true,
    moduleCache: false,
  });
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

export function getAggregateBackfillDeploymentKey(args: string[]): string {
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

  if (GITIGNORE_CONVEX_ENTRY_RE.test(existing)) {
    return;
  }

  const normalized =
    existing.endsWith('\n') || existing.length === 0
      ? existing
      : `${existing}\n`;
  fs.writeFileSync(gitignorePath, `${normalized}.convex/\n`);
}

// Track child processes for cleanup
const processes: any[] = [];

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
  syncEnv: typeof syncEnv;
  loadBetterConvexConfig: typeof loadBetterConvexConfig;
  ensureConvexGitignoreEntry: typeof ensureConvexGitignoreEntry;
  promptAdapter: PromptAdapter;
  enableDevSchemaWatch: boolean;
  realConvex: string;
  realConcave?: string;
};

export function getPluginLockfilePath(functionsDir: string): string {
  return join(functionsDir, 'plugins.lock.json');
}

function resolveCodegenTrimSegments(config: {
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
  publicName: BetterConvexBackend;
  internalName: 'convex' | 'concave-bun';
  command: string;
  argsPrefix: string[];
};

export function resolveConfiguredBackend(params: {
  backendArg?: BetterConvexBackend;
  config?: Pick<BetterConvexConfig, 'backend'>;
}): BetterConvexBackend {
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
  backend: BetterConvexBackend;
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
  config: ReturnType<typeof loadBetterConvexConfig>;
  sharedDir: string;
  debug: boolean;
  generateMetaFn: typeof generateMeta;
  execaFn: typeof execa;
  realConvexPath: string;
  realConcavePath?: string;
  additionalConvexArgs?: string[];
  backend?: BetterConvexBackend;
}): Promise<number> {
  const result = await runConfiguredCodegenDetailed({
    ...params,
    stdio: 'inherit',
  });
  return result.exitCode;
}

export async function runConfiguredCodegenDetailed(params: {
  config: ReturnType<typeof loadBetterConvexConfig>;
  sharedDir: string;
  debug: boolean;
  generateMetaFn: typeof generateMeta;
  execaFn: typeof execa;
  realConvexPath: string;
  realConcavePath?: string;
  additionalConvexArgs?: string[];
  backend?: BetterConvexBackend;
  env?: Record<string, string | undefined>;
  stdio?: 'inherit' | 'pipe';
  backendAdapter?: BackendAdapter;
}): Promise<CodegenRunResult> {
  const {
    config,
    sharedDir,
    debug,
    generateMetaFn,
    execaFn,
    realConvexPath,
    additionalConvexArgs,
    env,
    backend,
    backendAdapter,
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
  await generateMetaFn(sharedDir, {
    debug,
    scope: scope ?? 'all',
    trimSegments,
  });

  const result = await execaFn(
    resolvedRuntimeAdapter.command,
    [...resolvedRuntimeAdapter.argsPrefix, 'codegen', ...convexCodegenArgs],
    {
      stdio,
      cwd: process.cwd(),
      reject: false,
      env: {
        ...process.env,
        ...env,
      },
    }
  );
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

function requiresInitConvexBootstrap(output: string) {
  return INIT_CONVEX_BOOTSTRAP_REQUIRED_RE.test(output);
}

function formatInitCodegenFailure(output: string) {
  const trimmed = output.trim();
  return trimmed.length > 0
    ? `Failed to generate a real Better Convex runtime during init.\n${trimmed}`
    : 'Failed to generate a real Better Convex runtime during init.';
}

async function runConvexBootstrapForInit(params: {
  execaFn: typeof execa;
  runtimeAdapter: BackendAdapter;
  args: string[];
  env?: Record<string, string | undefined>;
}): Promise<CodegenRunResult> {
  const result = await params.execaFn(
    params.runtimeAdapter.command,
    [...params.runtimeAdapter.argsPrefix, ...params.args],
    {
      cwd: process.cwd(),
      env: params.env,
      reject: false,
      stdio: 'pipe',
    }
  );

  return {
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
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
  env?: Record<string, string | undefined>;
}): Promise<InitBootstrapResult> {
  const bootstrapProcess = params.execaFn(
    params.runtimeAdapter.command,
    [...params.runtimeAdapter.argsPrefix, ...params.args],
    {
      cwd: process.cwd(),
      env: params.env,
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
  config: ReturnType<typeof loadBetterConvexConfig>;
  backend: BetterConvexBackend;
  sharedDir: string;
  debug: boolean;
  generateMetaFn: typeof generateMeta;
  execaFn: typeof execa;
  realConvexPath: string;
  realConcavePath?: string;
  functionsDir: string;
  template?: string;
  team?: string;
  project?: string;
  devDeployment?: 'cloud' | 'local';
}): Promise<{
  codegen: InitCodegenStatus;
  convexBootstrap: InitConvexBootstrapStatus;
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
  const initial = await runConfiguredCodegenDetailed({
    config: params.config,
    sharedDir: params.sharedDir,
    debug: params.debug,
    generateMetaFn: params.generateMetaFn,
    execaFn: params.execaFn,
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
    };
  }

  const initialOutput = `${initial.stdout}\n${initial.stderr}`.trim();
  if (!requiresInitConvexBootstrap(initialOutput)) {
    throw new Error(formatInitCodegenFailure(initialOutput));
  }

  if (runtimeAdapter.publicName === 'convex' && params.team && params.project) {
    const devDeployment = params.devDeployment ?? INIT_DEFAULT_DEV_DEPLOYMENT;
    const bootstrap =
      devDeployment === 'local'
        ? await runLocalConvexBootstrapForInit({
            execaFn: params.execaFn,
            runtimeAdapter,
            args: [
              'dev',
              '--configure',
              'new',
              '--team',
              params.team,
              '--project',
              params.project,
              '--dev-deployment',
              devDeployment,
              '--local-force-upgrade',
              '--typecheck',
              'disable',
              '--tail-logs',
              'disable',
            ],
          })
        : await runConvexBootstrapForInit({
            execaFn: params.execaFn,
            runtimeAdapter,
            args: [
              'dev',
              '--once',
              '--configure',
              'new',
              '--team',
              params.team,
              '--project',
              params.project,
              '--dev-deployment',
              devDeployment,
              '--typecheck',
              'disable',
              '--tail-logs',
              'disable',
            ],
          }).then((result) => ({ ...result, stop: async () => {} }));
    if (bootstrap.exitCode !== 0) {
      await bootstrap.stop();
      throw new Error(
        formatInitCodegenFailure(`${bootstrap.stdout}\n${bootstrap.stderr}`)
      );
    }
    try {
      const retry = await runConfiguredCodegenDetailed({
        config: params.config,
        sharedDir: params.sharedDir,
        debug: params.debug,
        generateMetaFn: params.generateMetaFn,
        execaFn: params.execaFn,
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
        };
      }
      throw new Error(
        formatInitCodegenFailure(`${retry.stdout}\n${retry.stderr}`)
      );
    } finally {
      await bootstrap.stop();
    }
  }

  const anonymousBootstrap = await runLocalConvexBootstrapForInit({
    execaFn: params.execaFn,
    runtimeAdapter,
    env:
      runtimeAdapter.publicName === 'convex'
        ? {
            CONVEX_AGENT_MODE: 'anonymous',
          }
        : undefined,
    args:
      runtimeAdapter.publicName === 'convex'
        ? [
            'dev',
            '--local',
            '--local-force-upgrade',
            '--typecheck',
            'disable',
            '--tail-logs',
            'disable',
          ]
        : ['dev', '--bun'],
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
    };
  }

  try {
    const retry = await runConfiguredCodegenDetailed({
      config: params.config,
      sharedDir: params.sharedDir,
      debug: params.debug,
      generateMetaFn: params.generateMetaFn,
      execaFn: params.execaFn,
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
      };
    }

    const retryOutput = `${retry.stdout}\n${retry.stderr}`.trim();
    if (requiresInitConvexBootstrap(retryOutput)) {
      if (params.template) {
        throw new Error(formatInitCodegenFailure(retryOutput));
      }
      writeGeneratedServerStub(params.functionsDir);
      return {
        codegen: 'stubbed',
        convexBootstrap: 'missing',
      };
    }

    throw new Error(formatInitCodegenFailure(retryOutput));
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
        '`--backfill-mode` was removed. Use `better-convex aggregate rebuild`.'
      );
    }
    if (arg.startsWith('--backfill-mode=')) {
      throw new Error(
        '`--backfill-mode` was removed. Use `better-convex aggregate rebuild`.'
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
        '`better-convex reset` does not accept backfill flags. It always runs aggregateBackfill in resume mode.'
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
  backend: BetterConvexBackend,
  args: string[]
): string[] {
  return backend === 'concave'
    ? extractConcaveRunTargetArgs(args)
    : extractConvexRunTargetArgs(args);
}

function isMissingBackfillFunctionOutput(output: string): boolean {
  return MISSING_BACKFILL_FUNCTION_RE.test(output);
}

function parseBackendRunJson<T>(stdout: string): T {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return [] as T;
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
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
  signal?: AbortSignal;
  context: 'deploy' | 'dev' | 'aggregate';
}): Promise<number> {
  const {
    execaFn,
    backendAdapter,
    backfillConfig,
    mode,
    targetArgs,
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
    const message = `Aggregate backfill found ${needsRebuild} index definitions that require rebuild. Run \`better-convex aggregate rebuild\` for this deployment.`;
    if (backfillConfig.strict) {
      logger.error(message);
      return 1;
    }
    logger.warn(message);
  } else if (scheduled > 0) {
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
    if (progress !== lastProgress) {
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
// This file is auto-generated by better-convex migrate create.
// Do not edit manually.

import { defineMigrationSet } from 'better-convex/orm';
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
    logger.info(noopMessage);
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

async function runDevSchemaBackfillIfNeeded(params: {
  execaFn: typeof execa;
  backendAdapter: BackendAdapter;
  backfillConfig: AggregateBackfillConfig;
  functionsDir: string;
  targetArgs: string[];
  signal: AbortSignal;
}): Promise<number> {
  const {
    execaFn,
    backendAdapter,
    backfillConfig,
    functionsDir,
    targetArgs,
    signal,
  } = params;
  const fingerprint = await computeAggregateIndexFingerprint(functionsDir);
  if (!fingerprint) {
    return 0;
  }

  const deploymentKey = getAggregateBackfillDeploymentKey(targetArgs);
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
    syncEnv: syncEnvFn,
    loadBetterConvexConfig: loadBetterConvexConfigFn,
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
    syncEnv,
    loadBetterConvexConfig,
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

  let resolvedConfig: ReturnType<typeof loadBetterConvexConfigFn> | undefined;
  let resolvedBackend: BetterConvexBackend | undefined;
  let resolvedBackendAdapter: BackendAdapter | undefined;
  const getConfig = () => {
    resolvedConfig ??= loadBetterConvexConfigFn(configPath);
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
      command === 'create' ||
      command === 'add' ||
      command === 'view' ||
      command === 'info' ||
      command === 'docs' ||
      command === 'codegen') &&
    hasHelpFlag(restArgs)
  ) {
    printCommandHelp(command, getBackend());
    return 0;
  }

  if (command === 'init' || command === 'create') {
    const initArgs = parseInitCommandArgs(restArgs);
    const result = await runInitCommandFlow({
      initArgs,
      backendArg,
      configPath,
      execaFn,
      generateMetaFn,
      loadBetterConvexConfigFn,
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
        `✔ bootstrapped Better Convex: ${result.created.length} created, ${result.updated.length} updated, ${result.skipped.length} skipped.`
      );
    }

    return 0;
  }

  if (command === 'dev') {
    if (cliScope) {
      throw new Error(
        '`--scope` is not supported for `better-convex dev`. Use `better-convex codegen --scope <all|auth|orm>` for scoped generation.'
      );
    }
    const config = getConfig();
    const backend = getBackend();
    const backendAdapter = getBackendAdapter();
    const {
      remainingArgs: devArgsWithoutMigrationFlags,
      overrides: devMigrationOverrides,
    } = extractMigrationCliOptions(convexArgs);
    const { remainingArgs: devCommandArgs, overrides: devBackfillOverrides } =
      extractBackfillCliOptions(devArgsWithoutMigrationFlags);
    const sharedDir = cliSharedDir ?? config.paths.shared;
    const debug = cliDebug || config.dev.debug;
    const convexDevArgs = [...config.dev.args, ...devCommandArgs];
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
          `⚠️  Failed to ensure .convex/ is ignored in .gitignore: ${(error as Error).message}`
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
    const runtime = isTs ? 'bun' : process.execPath;

    const watcherProcess = execaFn(runtime, [watcherPath], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: {
        ...process.env,
        BETTER_CONVEX_API_OUTPUT_DIR: sharedDir || '',
        BETTER_CONVEX_DEBUG: debug ? '1' : '',
        BETTER_CONVEX_CODEGEN_SCOPE: 'all',
        BETTER_CONVEX_CODEGEN_TRIM_SEGMENTS: JSON.stringify(trimSegments),
      },
    });
    processes.push(watcherProcess);

    // Spawn real convex dev
    const convexProcess = execaFn(
      backendAdapter.command,
      [...backendAdapter.argsPrefix, 'dev', ...convexDevArgs],
      {
        stdio: 'inherit',
        cwd: process.cwd(),
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
      throw new Error(
        'Missing plugin name. Usage: better-convex add [plugin].'
      );
    }
    dryRunSpinner.start();
    const pluginDescriptor = getPluginDescriptor(selectedPlugin);
    const initializationPlan = isBetterConvexInitialized({
      functionsDir,
      config,
    })
      ? null
      : buildInitializationPlan({
          config,
          configPathArg: configPath,
          envFields: pluginDescriptor.envFields ?? [],
        });
    const effectiveConfig = initializationPlan?.config ?? config;
    const effectiveSharedDir = cliSharedDir ?? effectiveConfig.paths.shared;
    const effectiveFunctionsDir =
      initializationPlan?.functionsDir ??
      getConvexConfigFn(effectiveSharedDir).functionsDir;
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
            allTemplates,
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
      if (dependencyInstall.installed) {
        logger.success(`Installed ${dependencyInstall.packageName}.`);
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
      throw new Error(
        'Missing plugin name. Usage: better-convex view [plugin].'
      );
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
        betterConvexVersion: versions.betterConvexVersion,
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
      realConvexPath,
      realConcavePath,
      additionalConvexArgs: convexArgs,
      backend: getBackend(),
    });
  }
  if (command === 'env') {
    const subcommand = convexArgs[0];

    if (subcommand === 'sync') {
      // better-convex env sync [--auth] [--force] [--prod]
      const auth = restArgs.includes('--auth');
      const force = restArgs.includes('--force');
      const prod = restArgs.includes('--prod');
      await syncEnvFn({ auth, force, prod });
      return 0;
    }
    if (getBackend() === 'concave') {
      throw new Error(
        'Raw `better-convex env` passthrough is only available on the Convex backend.'
      );
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
      throw new Error(
        '`better-convex reset` is destructive. Re-run with `--yes`.'
      );
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
        'Unknown migrate command. Use: `better-convex migrate create|up|down|status|cancel`.'
      );
    }

    const config = getConfig();
    const backend = getBackend();
    const backendAdapter = getBackendAdapter();

    if (subcommand === 'create') {
      const rawName = restArgs.slice(1).join(' ').trim();
      if (!rawName) {
        throw new Error(
          'Missing migration name. Usage: `better-convex migrate create <name>`.'
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
        'Unknown aggregate command. Use: `better-convex aggregate backfill`, `better-convex aggregate rebuild`, or `better-convex aggregate prune`.'
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
  // bin shims are often symlinks (e.g. node_modules/.bin/better-convex).
  // Comparing resolved paths without dereferencing symlinks makes the CLI no-op.
  try {
    return (
      resolve(fs.realpathSync(entry)) === resolve(fs.realpathSync(filename))
    );
  } catch {
    return resolve(entry) === resolve(filename);
  }
}
