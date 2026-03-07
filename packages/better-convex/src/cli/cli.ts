import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, posix, relative, resolve } from 'node:path';
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
  PROJECT_GET_ENV_ACCESS_PLACEHOLDER,
  PROJECT_GET_ENV_IMPORT_PLACEHOLDER,
  PROJECT_SHARED_API_IMPORT_PLACEHOLDER,
  type SupportedPluginKey,
} from './plugin-catalog.js';

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

export type ParsedArgs = {
  command: string;
  restArgs: string[];
  convexArgs: string[];
  debug: boolean;
  sharedDir?: string;
  scope?: 'all' | 'auth' | 'orm';
  configPath?: string;
};

const VALID_SCOPES = new Set(['all', 'auth', 'orm']);
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
};
type DiffCommandArgs = {
  plugin?: SupportedPlugin;
  json: boolean;
  preset?: string;
  verboseDiff: boolean;
};
type ListCommandArgs = {
  json: boolean;
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
  envFilePath?: string;
};
type ScaffoldResult = {
  created: string[];
  updated: string[];
  skipped: string[];
};

type PluginEnvReminder = {
  key: string;
  path: string;
  message?: string;
};

type ScaffoldDiffStatus = 'changed' | 'missing';

type ScaffoldDiffResult = {
  filePath: string;
  status: ScaffoldDiffStatus;
  diff?: string;
};

type PluginDescriptor = PluginCatalogEntry;

type PluginDependencyInstallResult = {
  packageName?: string;
  packageJsonPath?: string;
  installed: boolean;
  skipped: boolean;
  reason?: 'missing_package_json' | 'already_present' | 'dry_run';
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

const ROOT_HELP_TEXT = `Usage: better-convex <command> [options]

Commands:
  dev                          Run dev workflow with codegen/watch passthrough
  codegen                      Generate Better Convex outputs
  add [plugin]                 Add a plugin scaffold + schema registration
  diff [plugin]                Preview plugin scaffold drift (read-only)
  list                         List installed plugins
  env                          Env helper and convex env passthrough
  deploy                       Deploy with migrations/backfill flows
  migrate                      Migration lifecycle commands
  aggregate                    Aggregate backfill/rebuild/prune commands
  analyze                      Analyze Convex runtime bundle
  reset                        Destructive database reset (requires --yes)

Run "better-convex <command> --help" for command options.`;

const ADD_HELP_TEXT = `Usage: better-convex add [plugin] [options]

Options:
  --yes, -y         Deterministic non-interactive mode
  --json            Machine-readable command output
  --dry-run         Show planned operations without writing files
  --overwrite       Overwrite existing changed files without prompt
  --no-codegen      Skip automatic codegen after add
  --preset, -p      Plugin preset override`;

const DIFF_HELP_TEXT = `Usage: better-convex diff [plugin] [options]

Options:
  --json            Machine-readable command output
  --preset, -p      Plugin preset override
  --verbose-diff    Print unified patches for changed/missing files`;

const LIST_HELP_TEXT = `Usage: better-convex list [options]

Options:
  --json            Machine-readable plugin inventory output`;

const CODEGEN_HELP_TEXT = `Usage: better-convex codegen [options]

Options:
  --api <dir>       Output directory (default from config)
  --scope <mode>    Generation scope: all | auth | orm
  --config <path>   Config path override
  --debug           Show detailed output`;

// Parse args: better-convex [command] [--api <dir>] [--scope <all|auth|orm>] [--config <path>] [--debug] [...convex-args]
export function parseArgs(argv: string[]): ParsedArgs {
  let debug = false;
  let sharedDir: string | undefined;
  let scope: 'all' | 'auth' | 'orm' | undefined;
  let configPath: string | undefined;

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

    filtered.push(a);
  }

  const command = filtered[0] || 'dev';
  const restArgs = filtered.slice(1);

  return {
    command,
    restArgs,
    convexArgs: restArgs,
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

function printRootHelp(): void {
  console.info(ROOT_HELP_TEXT);
}

function printCommandHelp(command: string): void {
  if (command === 'add') {
    console.info(ADD_HELP_TEXT);
    return;
  }
  if (command === 'diff') {
    console.info(DIFF_HELP_TEXT);
    return;
  }
  if (command === 'list') {
    console.info(LIST_HELP_TEXT);
    return;
  }
  if (command === 'codegen') {
    console.info(CODEGEN_HELP_TEXT);
    return;
  }
  printRootHelp();
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
        message: `${params.message} (space to toggle)`,
        options: options as any,
        initialValues: params.initialValues as TValue[] | undefined,
        required: params.required,
      })) as TValue[] | symbol;
    },
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
    dryRun,
    overwrite,
    noCodegen,
    preset,
  };
}

function parseDiffCommandArgs(args: string[]): DiffCommandArgs {
  const { plugin, startIndex } = parsePluginPosition(args);

  let json = false;
  let verboseDiff = false;
  let preset: string | undefined;

  for (let i = startIndex; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--verbose-diff') {
      verboseDiff = true;
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
    throw new Error(`Unknown diff flag "${arg}".`);
  }

  return {
    plugin,
    json,
    preset,
    verboseDiff,
  };
}

function parseListCommandArgs(args: string[]): ListCommandArgs {
  let json = false;
  for (const arg of args) {
    if (arg === '--json') {
      json = true;
      continue;
    }
    throw new Error(`Unknown list flag "${arg}".`);
  }
  return { json };
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

async function ensurePluginDependencyInstalled(params: {
  descriptor: PluginDescriptor;
  dryRun: boolean;
  execaFn: typeof execa;
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
  if (params.dryRun) {
    return {
      packageName,
      packageJsonPath,
      installed: false,
      skipped: true,
      reason: 'dry_run',
    };
  }

  await params.execaFn('bun', ['add', packageName], {
    cwd: dirname(packageJsonPath),
    stdio: 'inherit',
  });
  return {
    packageName,
    packageJsonPath,
    installed: true,
    skipped: false,
  };
}

async function resolvePluginPreset(
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

async function promptForPluginSelection(
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

function resolvePresetScaffoldTemplates(
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

function resolveTemplatesByIdOrThrow(
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

function filterScaffoldTemplatePathMap(
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

function resolveAddTemplateDefaults(params: {
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

async function promptForScaffoldTemplateSelection(
  promptAdapter: PromptAdapter,
  descriptor: PluginDescriptor,
  allTemplates: readonly ScaffoldTemplate[],
  presetTemplateIds: readonly string[],
  roots: ResolvedScaffoldRoots
): Promise<string[]> {
  const selected = await promptAdapter.multiselect({
    message: `Select scaffold files for plugin "${descriptor.key}"`,
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

function resolvePluginScaffoldRoots(
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
    envFilePath: config.paths.env
      ? resolveEnvHelperFilePath(config.paths.env)
      : undefined,
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
    const getEnvImportPath = roots.envFilePath
      ? resolveProjectGetEnvImportPrefix(filePath, roots.envFilePath)
      : null;
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
        getEnvImportPath ? `import { getEnv } from "${getEnvImportPath}";` : ''
      )
      .replaceAll(
        PROJECT_GET_ENV_ACCESS_PLACEHOLDER,
        getEnvImportPath ? 'getEnv()' : 'process.env'
      )
      .replaceAll(
        PLUGIN_CONFIG_IMPORT_PLACEHOLDER,
        resolvePluginConfigImportPrefix(filePath, roots.libRootDir)
      )
      .replaceAll(
        PLUGIN_SCHEMA_IMPORT_PLACEHOLDER,
        resolvePluginSchemaImportPrefix(filePath, roots.libRootDir)
      );

    if (roots.envFilePath && content.includes('process.env')) {
      throw new Error(
        `Scaffold template "${template.id}" contains process.env while paths.env is configured.`
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

function readPluginLockfile(lockfilePath: string): PluginLockfile {
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

function writePluginLockfile(
  lockfilePath: string,
  lockfile: PluginLockfile
): void {
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
  fs.mkdirSync(dirname(lockfilePath), { recursive: true });
  fs.writeFileSync(
    lockfilePath,
    `${JSON.stringify(
      {
        plugins: normalizedPlugins,
      },
      null,
      2
    )}\n`
  );
}

async function resolveSchemaInstalledPlugins(
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

function renderDiff(filePath: string, before: string, after: string): string {
  const relPath = normalizePath(relative(process.cwd(), filePath));
  const beforeLines = before.trimEnd().split('\n');
  const afterLines = after.trimEnd().split('\n');
  return [
    `--- ${relPath}`,
    `+++ ${relPath}`,
    `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`,
    ...beforeLines.map((line) => `-${line}`),
    ...afterLines.map((line) => `+${line}`),
  ].join('\n');
}

async function applyScaffoldFiles(
  files: readonly ScaffoldFile[],
  options: {
    dryRun: boolean;
    yes: boolean;
    overwrite: boolean;
    promptAdapter: PromptAdapter;
  }
): Promise<ScaffoldResult> {
  const result: ScaffoldResult = {
    created: [],
    updated: [],
    skipped: [],
  };

  for (const file of files) {
    const normalized = normalizePath(file.filePath);
    const exists = fs.existsSync(file.filePath);
    if (!exists) {
      result.created.push(normalized);
      if (!options.dryRun) {
        fs.mkdirSync(dirname(file.filePath), { recursive: true });
        fs.writeFileSync(file.filePath, file.content);
      }
      continue;
    }

    const existingContent = fs.readFileSync(file.filePath, 'utf8');
    if (existingContent === file.content) {
      result.skipped.push(normalized);
      continue;
    }

    const canPrompt = !options.yes && options.promptAdapter.isInteractive();
    let shouldOverwrite = options.overwrite;
    if (!shouldOverwrite && canPrompt) {
      const response = await options.promptAdapter.confirm(
        `Overwrite ${normalizePath(relative(process.cwd(), file.filePath))}?`
      );
      shouldOverwrite = response;
    }

    if (!shouldOverwrite) {
      result.skipped.push(normalized);
      continue;
    }

    result.updated.push(normalized);
    if (!options.dryRun) {
      fs.writeFileSync(file.filePath, file.content);
    }
  }

  return result;
}

function computeScaffoldDiffs(
  files: readonly ScaffoldFile[],
  options: {
    includePatch: boolean;
  }
): ScaffoldDiffResult[] {
  const diffs: ScaffoldDiffResult[] = [];
  for (const file of files) {
    const exists = fs.existsSync(file.filePath);
    if (!exists) {
      diffs.push({
        filePath: normalizePath(file.filePath),
        status: 'missing',
        diff: options.includePatch
          ? renderDiff(file.filePath, '', file.content)
          : undefined,
      });
      continue;
    }
    const existingContent = fs.readFileSync(file.filePath, 'utf8');
    if (existingContent !== file.content) {
      diffs.push({
        filePath: normalizePath(file.filePath),
        status: 'changed',
        diff: options.includePatch
          ? renderDiff(file.filePath, existingContent, file.content)
          : undefined,
      });
    }
  }
  return diffs;
}

function ensureSchemaExtensionRegistered(
  functionsDir: string,
  descriptor: PluginDescriptor,
  dryRun: boolean,
  roots: ResolvedScaffoldRoots
): { updated: boolean; skipped: boolean } {
  const schemaPath = join(functionsDir, 'schema.ts');
  if (!fs.existsSync(schemaPath)) {
    return { updated: false, skipped: true };
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

  let source = fs.readFileSync(schemaPath, 'utf8');
  const original = source;
  if (source.includes(`${pluginFactory}()`)) {
    return { updated: false, skipped: true };
  }

  const importRegex = new RegExp(
    `import\\s+\\{[^}]*\\b${pluginFactory}\\b[^}]*\\}\\s+from\\s+['"]${pluginImportPath}['"];?`
  );
  if (!importRegex.test(source)) {
    source = `import { ${pluginFactory} } from '${pluginImportPath}';\n${source}`;
  }

  if (CHAIN_EXTEND_RE.test(source)) {
    source = source.replace(
      CHAIN_EXTEND_RE,
      (_match, inner: string) => `.extend(${pluginFactory}(), ${inner.trim()})`
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

  if (source === original) {
    return { updated: false, skipped: true };
  }
  if (!dryRun) {
    fs.writeFileSync(schemaPath, source);
  }
  return { updated: true, skipped: false };
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

function cleanup() {
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
};

function getPluginLockfilePath(functionsDir: string): string {
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

async function runConfiguredCodegen(params: {
  config: ReturnType<typeof loadBetterConvexConfig>;
  sharedDir: string;
  debug: boolean;
  generateMetaFn: typeof generateMeta;
  execaFn: typeof execa;
  realConvexPath: string;
  additionalConvexArgs?: string[];
}): Promise<number> {
  const {
    config,
    sharedDir,
    debug,
    generateMetaFn,
    execaFn,
    realConvexPath,
    additionalConvexArgs,
  } = params;
  const scope = config.codegen.scope;
  const trimSegments = resolveCodegenTrimSegments(config);
  const convexCodegenArgs = [
    ...config.codegen.args,
    ...(additionalConvexArgs ?? []),
  ];
  await generateMetaFn(sharedDir, {
    debug,
    scope: scope ?? 'all',
    trimSegments,
  });

  const result = await execaFn(
    'node',
    [realConvexPath, 'codegen', ...convexCodegenArgs],
    {
      stdio: 'inherit',
      cwd: process.cwd(),
    }
  );
  return result.exitCode ?? 0;
}

async function runAfterScaffoldScript(params: {
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

function extractBackfillCliOptions(args: string[]): {
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

function extractMigrationCliOptions(args: string[]): {
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

function extractResetCliOptions(args: string[]): ResetCliOptions {
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

function resolveBackfillConfig(
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

function resolveMigrationConfig(
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

function extractRunDeploymentArgs(args: string[]): string[] {
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

function isMissingBackfillFunctionOutput(output: string): boolean {
  return MISSING_BACKFILL_FUNCTION_RE.test(output);
}

function parseConvexRunJson<T>(stdout: string): T {
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
    `Failed to parse convex run output as JSON.\nOutput:\n${stdout.trim()}`
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

async function runConvexFunction(
  execaFn: typeof execa,
  realConvexPath: string,
  functionName: string,
  args: Record<string, unknown>,
  deploymentArgs: string[],
  options?: {
    echoOutput?: boolean;
  }
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = await execaFn(
    'node',
    [
      realConvexPath,
      'run',
      ...deploymentArgs,
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

async function runAggregateBackfillFlow(params: {
  execaFn: typeof execa;
  realConvexPath: string;
  backfillConfig: AggregateBackfillConfig;
  mode: 'resume' | 'rebuild';
  deploymentArgs: string[];
  signal?: AbortSignal;
  context: 'deploy' | 'dev' | 'aggregate';
}): Promise<number> {
  const {
    execaFn,
    realConvexPath,
    backfillConfig,
    mode,
    deploymentArgs,
    signal,
    context,
  } = params;
  if (signal?.aborted) {
    return 0;
  }

  if (backfillConfig.enabled === 'off') {
    return 0;
  }

  const kickoff = await runConvexFunction(
    execaFn,
    realConvexPath,
    'generated/server:aggregateBackfill',
    {
      mode,
      batchSize: backfillConfig.batchSize,
    },
    deploymentArgs,
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
        console.info(
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
  const kickoffPayload = parseConvexRunJson<KickoffResult | unknown[]>(
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
    console.info(`ℹ️  aggregateBackfill pruned ${pruned} removed indexes`);
  }
  if (mode === 'resume' && needsRebuild > 0) {
    const message = `Aggregate backfill found ${needsRebuild} index definitions that require rebuild. Run \`better-convex aggregate rebuild\` for this deployment.`;
    if (backfillConfig.strict) {
      console.error(`❌ ${message}`);
      return 1;
    }
    console.warn(`⚠️  ${message}`);
  } else if (scheduled > 0) {
    console.info(
      `ℹ️  aggregateBackfill scheduled ${scheduled}/${targets} target indexes`
    );
  }

  if (!backfillConfig.wait || signal?.aborted) {
    return 0;
  }

  const deadline = Date.now() + backfillConfig.timeoutMs;
  let lastProgress = '';
  while (!signal?.aborted) {
    const statusResult = await runConvexFunction(
      execaFn,
      realConvexPath,
      'generated/server:aggregateBackfillStatus',
      {},
      deploymentArgs,
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
    const statuses = parseConvexRunJson<BackfillStatusEntry[]>(
      statusResult.stdout
    );
    const failed = statuses.find((entry) => Boolean(entry.lastError));
    if (failed) {
      console.error(
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
        console.info(`ℹ️  aggregateBackfill progress ${ready}/${total} READY`);
      }
    }

    if (total === 0 || ready === total) {
      return 0;
    }
    if (Date.now() > deadline) {
      const timeoutMessage = `Aggregate backfill timed out after ${backfillConfig.timeoutMs}ms (${ready}/${total} READY).`;
      if (backfillConfig.strict) {
        console.error(`❌ ${timeoutMessage}`);
        return 1;
      }
      console.warn(`⚠️  ${timeoutMessage}`);
      return 0;
    }
    await sleep(backfillConfig.pollIntervalMs, signal);
  }

  return 0;
}

async function runAggregatePruneFlow(params: {
  execaFn: typeof execa;
  realConvexPath: string;
  deploymentArgs: string[];
}): Promise<number> {
  const { execaFn, realConvexPath, deploymentArgs } = params;
  const result = await runConvexFunction(
    execaFn,
    realConvexPath,
    'generated/server:aggregateBackfill',
    {
      mode: 'prune',
    },
    deploymentArgs,
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
  const payload = parseConvexRunJson<PruneResult | unknown[]>(result.stdout);
  const pruned =
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    typeof payload.pruned === 'number'
      ? payload.pruned
      : 0;

  if (pruned > 0) {
    console.info(`ℹ️  aggregateBackfill pruned ${pruned} removed indexes`);
  } else {
    console.info('ℹ️  aggregateBackfill prune no-op');
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

function extractMigrationDownOptions(args: string[]): {
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

async function runMigrationCreate(params: {
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

  console.info(`ℹ️  created migration ${migrationId}`);
  console.info(`ℹ️  file: ${migrationFile}`);
  console.info(`ℹ️  manifest: ${manifestFile}`);
}

async function runMigrationFlow(params: {
  execaFn: typeof execa;
  realConvexPath: string;
  migrationConfig: MigrationConfig;
  deploymentArgs: string[];
  signal?: AbortSignal;
  context: 'deploy' | 'dev' | 'migration';
  direction: 'up' | 'down';
  steps?: number;
  to?: string;
}): Promise<number> {
  const {
    execaFn,
    realConvexPath,
    migrationConfig,
    deploymentArgs,
    signal,
    context,
    direction,
    steps,
    to,
  } = params;
  if (signal?.aborted || migrationConfig.enabled === 'off') {
    return 0;
  }

  const kickoff = await runConvexFunction(
    execaFn,
    realConvexPath,
    'generated/server:migrationRun',
    {
      direction,
      batchSize: migrationConfig.batchSize,
      allowDrift: migrationConfig.allowDrift,
      ...(steps !== undefined ? { steps } : {}),
      ...(to !== undefined ? { to } : {}),
    },
    deploymentArgs,
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
        console.info(
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
  const payload = parseConvexRunJson<KickoffPayload | unknown[]>(
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
      console.error(`❌ ${message}`);
      return 1;
    }
    console.warn(`⚠️  ${message}`);
    return 0;
  }
  if (kickoffStatus === 'noop') {
    const noopMessage =
      direction === 'down'
        ? 'No applied migrations to roll back.'
        : 'No pending migrations to apply.';
    console.info(`ℹ️  ${noopMessage}`);
    return 0;
  }
  if (kickoffStatus === 'dry_run') {
    console.info('ℹ️  migration dry run completed (no writes committed).');
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
    const statusResult = await runConvexFunction(
      execaFn,
      realConvexPath,
      'generated/server:migrationStatus',
      {
        runId,
      },
      deploymentArgs,
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
    const statusPayload = parseConvexRunJson<StatusPayload | unknown[]>(
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
      console.info(`ℹ️  migration ${runStatus} ${currentIndex}/${total}`);
    }

    if (runStatus === 'completed' || runStatus === 'noop') {
      return 0;
    }
    if (runStatus === 'failed' || runStatus === 'canceled') {
      const message = `Migrations ${runStatus} for run ${runId}.`;
      if (migrationConfig.strict) {
        console.error(`❌ ${message}`);
        return 1;
      }
      console.warn(`⚠️  ${message}`);
      return 0;
    }

    if (Date.now() > deadline) {
      const timeoutMessage = `Migrations timed out after ${migrationConfig.timeoutMs}ms.`;
      if (migrationConfig.strict) {
        console.error(`❌ ${timeoutMessage}`);
        return 1;
      }
      console.warn(`⚠️  ${timeoutMessage}`);
      return 0;
    }

    await sleep(migrationConfig.pollIntervalMs, signal);
  }

  return 0;
}

async function runDevSchemaBackfillIfNeeded(params: {
  execaFn: typeof execa;
  realConvexPath: string;
  backfillConfig: AggregateBackfillConfig;
  functionsDir: string;
  deploymentArgs: string[];
  signal: AbortSignal;
}): Promise<number> {
  const {
    execaFn,
    realConvexPath,
    backfillConfig,
    functionsDir,
    deploymentArgs,
    signal,
  } = params;
  const fingerprint = await computeAggregateIndexFingerprint(functionsDir);
  if (!fingerprint) {
    return 0;
  }

  const deploymentKey = getAggregateBackfillDeploymentKey(deploymentArgs);
  const statePath = getDevAggregateBackfillStatePath();
  const state = readAggregateFingerprintState(statePath);
  const existing = state.entries[deploymentKey];
  if (existing?.fingerprint === fingerprint) {
    return 0;
  }

  console.info(`ℹ️  aggregateBackfill resume (${deploymentKey} schema change)`);
  const exitCode = await runAggregateBackfillFlow({
    execaFn,
    realConvexPath,
    backfillConfig: {
      ...backfillConfig,
      enabled: 'on',
    },
    mode: 'resume',
    deploymentArgs,
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
    ...deps,
  };

  if (argv.length > 0) {
    const firstArg = argv[0];
    if (firstArg === '--help' || firstArg === '-h') {
      printRootHelp();
      return 0;
    }
    if (firstArg === 'help') {
      printCommandHelp(argv[1] ?? '');
      return 0;
    }
  }

  const {
    command,
    restArgs,
    convexArgs,
    debug: cliDebug,
    sharedDir: cliSharedDir,
    scope: cliScope,
    configPath,
  } = parseArgs(argv);

  if (command === '--help' || command === '-h') {
    printRootHelp();
    return 0;
  }

  if (
    (command === 'add' ||
      command === 'diff' ||
      command === 'list' ||
      command === 'codegen') &&
    hasHelpFlag(restArgs)
  ) {
    printCommandHelp(command);
    return 0;
  }

  if (command === 'dev') {
    if (cliScope) {
      throw new Error(
        '`--scope` is not supported for `better-convex dev`. Use `better-convex codegen --scope <all|auth|orm>` for scoped generation.'
      );
    }
    const config = loadBetterConvexConfigFn(configPath);
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
    const deploymentArgs = extractRunDeploymentArgs(convexDevArgs);
    const trimSegments = resolveCodegenTrimSegments(config);

    if (!deps) {
      try {
        ensureConvexGitignoreEntryFn(process.cwd());
      } catch (error) {
        console.warn(
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
      'node',
      [realConvexPath, 'dev', ...convexDevArgs],
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
          realConvexPath,
          backfillConfig: devBackfillConfig,
          functionsDir,
          deploymentArgs,
          signal: backfillAbortController.signal,
        });
        if (exitCode !== 0 && !backfillAbortController.signal.aborted) {
          console.warn(
            '⚠️  aggregateBackfill on schema update failed in dev (continuing without blocking).'
          );
        }
      } catch (error) {
        if (!backfillAbortController.signal.aborted) {
          console.warn(
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
            realConvexPath,
            migrationConfig: devMigrationConfig,
            deploymentArgs,
            signal: backfillAbortController.signal,
            context: 'dev',
            direction: 'up',
          });
          if (exitCode !== 0 && !backfillAbortController.signal.aborted) {
            console.warn(
              '⚠️  migration up failed in dev (continuing without blocking).'
            );
          }
        } catch (error) {
          if (!backfillAbortController.signal.aborted) {
            console.warn(
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
            realConvexPath,
            backfillConfig: devBackfillConfig,
            mode: 'resume',
            deploymentArgs,
            signal: backfillAbortController.signal,
            context: 'dev',
          });
          if (exitCode !== 0 && !backfillAbortController.signal.aborted) {
            console.warn(
              '⚠️  aggregateBackfill kickoff failed in dev (continuing without blocking).'
            );
          }
        } catch (error) {
          if (!backfillAbortController.signal.aborted) {
            console.warn(
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
            console.warn(
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
    const config = loadBetterConvexConfigFn(configPath);
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
    const lockfilePath = getPluginLockfilePath(functionsDir);
    const lockfile = readPluginLockfile(lockfilePath);
    const existingTemplatePathMap = filterScaffoldTemplatePathMap(
      lockfile.plugins[selectedPlugin]?.files ?? {},
      allTemplates.map((template) => template.id)
    );
    const existingTemplateIds = Object.keys(existingTemplatePathMap);
    const presetTemplateIds = presetTemplates.map((template) => template.id);
    const defaultTemplateIds = resolveAddTemplateDefaults({
      presetArg: addArgs.preset,
      lockfileTemplateIds: existingTemplateIds,
      presetTemplateIds,
      availableTemplateIds: allTemplates.map((template) => template.id),
    });
    const envBootstrap = buildEnvBootstrapFiles(
      config,
      configPath,
      pluginDescriptor.envFields ?? []
    );
    const effectiveConfig = envBootstrap.config;
    const scaffoldRoots = resolvePluginScaffoldRoots(
      functionsDir,
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
    const dependencyHintMessages = [
      ...new Set(
        selectedTemplates
          .map((template) => template.dependencyHintMessage)
          .filter((value): value is string => typeof value === 'string')
      ),
    ];
    const dependencyHints = [
      ...new Set(
        selectedTemplates
          .flatMap((template) => template.dependencyHints)
          .filter((value): value is string => typeof value === 'string')
      ),
    ];
    const dependencyHintCommand =
      dependencyHints.length > 0
        ? `bun add ${dependencyHints.join(' ')}`
        : undefined;
    const envReminders = resolvePluginEnvReminders(
      functionsDir,
      pluginDescriptor.envFields ?? []
    );
    const nextSteps = dependencyHintCommand
      ? [`Install scaffold dependencies: ${dependencyHintCommand}`]
      : [];

    const scaffoldFiles = resolvePluginScaffoldFiles(
      selectedTemplates,
      scaffoldRoots,
      functionsDir,
      existingTemplatePathMap
    );
    if (!addArgs.json) {
      const selectedFiles = [...envBootstrap.files, ...scaffoldFiles]
        .map((file) => normalizePath(relative(process.cwd(), file.filePath)))
        .sort((a, b) => a.localeCompare(b));
      console.info(
        `ℹ️  Selected scaffold files:\n${selectedFiles
          .map((file) => `  - ${file}`)
          .join('\n')}`
      );
    }
    const envBootstrapResult = await applyScaffoldFiles(envBootstrap.files, {
      dryRun: addArgs.dryRun,
      yes: addArgs.yes,
      overwrite: addArgs.overwrite,
      promptAdapter,
    });
    const requiredEnvBootstrapConflicts = addArgs.dryRun
      ? []
      : envBootstrap.files
          .map((file) => ({
            filePath: normalizePath(file.filePath),
            hasMismatch:
              fs.existsSync(file.filePath) &&
              fs.readFileSync(file.filePath, 'utf8') !== file.content,
          }))
          .filter((file) => file.hasMismatch)
          .map((file) => file.filePath);
    if (requiredEnvBootstrapConflicts.length > 0) {
      throw new Error(
        `Cannot scaffold "${selectedPlugin}" without updating required env bootstrap files:\n${requiredEnvBootstrapConflicts
          .map((file) => `  - ${file}`)
          .join('\n')}`
      );
    }
    const pluginScaffoldResult = await applyScaffoldFiles(scaffoldFiles, {
      dryRun: addArgs.dryRun,
      yes: addArgs.yes,
      overwrite: addArgs.overwrite,
      promptAdapter,
    });
    const scaffoldResult: ScaffoldResult = {
      created: [...envBootstrapResult.created, ...pluginScaffoldResult.created],
      updated: [...envBootstrapResult.updated, ...pluginScaffoldResult.updated],
      skipped: [...envBootstrapResult.skipped, ...pluginScaffoldResult.skipped],
    };
    const schemaRegistration = ensureSchemaExtensionRegistered(
      functionsDir,
      pluginDescriptor,
      addArgs.dryRun,
      scaffoldRoots
    );
    const dependencyInstall = await ensurePluginDependencyInstalled({
      descriptor: pluginDescriptor,
      dryRun: addArgs.dryRun,
      execaFn,
    });
    const pluginScaffoldPaths = {
      ...existingTemplatePathMap,
      ...Object.fromEntries(
        scaffoldFiles.map((file) => [file.templateId, file.lockfilePath])
      ),
    };
    const nextPluginEntry =
      Object.keys(pluginScaffoldPaths).length > 0
        ? {
            package: pluginDescriptor.packageName,
            files: pluginScaffoldPaths,
          }
        : {
            package: pluginDescriptor.packageName,
          };
    const nextLockfile: PluginLockfile = {
      plugins: {
        ...lockfile.plugins,
        [selectedPlugin]: nextPluginEntry,
      },
    };
    if (!addArgs.dryRun) {
      writePluginLockfile(lockfilePath, nextLockfile);
    }

    const payload = {
      command: 'add',
      plugin: selectedPlugin,
      preset: resolvedPreset,
      presetTemplateIds,
      selectedTemplateIds,
      dryRun: addArgs.dryRun,
      created: scaffoldResult.created,
      updated: scaffoldResult.updated,
      skipped: scaffoldResult.skipped,
      schemaUpdated: schemaRegistration.updated,
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
      dependencyHints,
      envReminders,
      nextSteps,
      lockfilePath: normalizePath(relative(process.cwd(), lockfilePath)),
    };
    if (addArgs.json) {
      console.info(JSON.stringify(payload));
    } else {
      const createdCount = scaffoldResult.created.length;
      const updatedCount = scaffoldResult.updated.length;
      const skippedCount = scaffoldResult.skipped.length;
      console.info(
        `✔ ${selectedPlugin} scaffold results: ${createdCount} created, ${updatedCount} updated, ${skippedCount} skipped.`
      );
      if (createdCount > 0) {
        console.info(
          `Created files:\n${scaffoldResult.created
            .map((file) => `  - ${file}`)
            .join('\n')}`
        );
      }
      if (updatedCount > 0) {
        console.info(
          `Updated files:\n${scaffoldResult.updated
            .map((file) => `  - ${file}`)
            .join('\n')}`
        );
      }
      if (skippedCount > 0) {
        console.info(
          `Skipped files:\n${scaffoldResult.skipped
            .map((file) => `  - ${file}`)
            .join('\n')}`
        );
        if (!addArgs.overwrite) {
          console.info('ℹ️  Re-run with --overwrite to replace changed files.');
        }
      }
      if (schemaRegistration.updated) {
        console.info('✔ Updated schema.ts extension registration.');
      }
      if (dependencyInstall.installed) {
        console.info(`✔ Installed ${dependencyInstall.packageName}.`);
      }
      if (dependencyHints.length > 0) {
        const hintMessage =
          dependencyHintMessages[0] ?? 'Additional dependencies are required';
        console.info(`ℹ️  ${hintMessage}.`);
        console.info(
          `Dependencies:\n${dependencyHints.map((hint) => `  - ${hint}`).join('\n')}`
        );
        if (dependencyHintCommand) {
          console.info(`Install command: ${dependencyHintCommand}`);
        }
      }
      if (envReminders.length > 0) {
        const remindersByPath = new Map<string, PluginEnvReminder[]>();
        for (const reminder of envReminders) {
          const existing = remindersByPath.get(reminder.path) ?? [];
          existing.push(reminder);
          remindersByPath.set(reminder.path, existing);
        }
        for (const [envPath, reminders] of remindersByPath.entries()) {
          console.info(`ℹ️  Set plugin env values in ${envPath}.`);
          console.info(
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

    if (!addArgs.noCodegen && !addArgs.dryRun) {
      const codegenExitCode = await runConfiguredCodegen({
        config: effectiveConfig,
        sharedDir,
        debug: cliDebug || effectiveConfig.codegen.debug,
        generateMetaFn,
        execaFn,
        realConvexPath,
      });
      if (codegenExitCode !== 0) {
        return codegenExitCode;
      }
    }

    if (!addArgs.dryRun && effectiveConfig.hooks.postAdd.length > 0) {
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
  if (command === 'diff') {
    const diffArgs = parseDiffCommandArgs(restArgs);
    const config = loadBetterConvexConfigFn(configPath);
    const sharedDir = cliSharedDir ?? config.paths.shared;
    const { functionsDir } = getConvexConfigFn(sharedDir);
    const lockfilePath = getPluginLockfilePath(functionsDir);
    const schemaPlugins = await resolveSchemaInstalledPlugins(functionsDir);
    const existingLockfile = readPluginLockfile(lockfilePath);
    const installedPlugins = [
      ...new Set([
        ...(Object.keys(existingLockfile.plugins).filter((key) =>
          isSupportedPluginKey(key)
        ) as SupportedPlugin[]),
        ...schemaPlugins,
      ]),
    ].sort((a, b) => a.localeCompare(b)) as SupportedPlugin[];
    if (!diffArgs.plugin && installedPlugins.length === 0) {
      throw new Error(
        'No installed plugins found. Usage: better-convex diff [plugin].'
      );
    }
    const selectedPlugin =
      diffArgs.plugin ??
      (promptAdapter.isInteractive()
        ? await promptForPluginSelection(
            promptAdapter,
            installedPlugins,
            'Select a plugin to diff'
          )
        : undefined);
    if (!selectedPlugin) {
      throw new Error(
        'Missing plugin name. Usage: better-convex diff [plugin].'
      );
    }
    const pluginDescriptor = getPluginDescriptor(selectedPlugin);
    const resolvedPreset = await resolvePluginPreset(
      pluginDescriptor,
      promptAdapter,
      diffArgs.preset
    );
    const allTemplates = collectPluginScaffoldTemplates(pluginDescriptor);
    const existingTemplatePathMap = filterScaffoldTemplatePathMap(
      existingLockfile.plugins[selectedPlugin]?.files ?? {},
      allTemplates.map((template) => template.id)
    );
    const existingTemplateIds = Object.keys(existingTemplatePathMap);
    const presetTemplates = resolvePresetScaffoldTemplates(
      pluginDescriptor,
      resolvedPreset
    );
    const presetTemplateIds = presetTemplates.map((template) => template.id);
    const templateIdsUsed =
      typeof diffArgs.preset === 'string'
        ? presetTemplateIds
        : existingTemplateIds.length > 0
          ? existingTemplateIds
          : presetTemplateIds;
    const selectedTemplates = resolveTemplatesByIdOrThrow(
      pluginDescriptor,
      allTemplates,
      templateIdsUsed,
      diffArgs.preset
        ? `diff preset "${diffArgs.preset}"`
        : existingTemplateIds.length > 0
          ? 'diff lockfile selection'
          : `diff fallback preset "${resolvedPreset}"`
    );
    const scaffoldRoots = resolvePluginScaffoldRoots(
      functionsDir,
      pluginDescriptor,
      config
    );
    const scaffoldFiles = resolvePluginScaffoldFiles(
      selectedTemplates,
      scaffoldRoots,
      functionsDir,
      existingTemplatePathMap
    );
    const drift = computeScaffoldDiffs(scaffoldFiles, {
      includePatch: diffArgs.verboseDiff,
    });
    const driftItems = drift.map((entry) => ({
      path: normalizePath(relative(process.cwd(), entry.filePath)),
      status: entry.status,
      ...(entry.diff ? { patch: entry.diff } : {}),
    }));
    const payload = {
      command: 'diff',
      plugin: selectedPlugin,
      preset: resolvedPreset,
      templateIdsUsed,
      clean: driftItems.length === 0,
      files: driftItems,
      lockfilePath: normalizePath(relative(process.cwd(), lockfilePath)),
    };

    if (diffArgs.json) {
      console.info(JSON.stringify(payload));
    } else if (driftItems.length === 0) {
      console.info(
        `✔ No scaffold drift detected for plugin "${selectedPlugin}".`
      );
    } else {
      console.info(
        `Scaffold drift for plugin "${selectedPlugin}": ${driftItems.length} file(s).`
      );
      for (const entry of driftItems) {
        console.info(`  - ${entry.status}: ${entry.path}`);
      }
      if (diffArgs.verboseDiff) {
        for (const entry of driftItems) {
          if ('patch' in entry && typeof entry.patch === 'string') {
            console.info(entry.patch);
          }
        }
      }
    }
    return 0;
  }
  if (command === 'list') {
    const listArgs = parseListCommandArgs(restArgs);
    const config = loadBetterConvexConfigFn(configPath);
    const sharedDir = cliSharedDir ?? config.paths.shared;
    const { functionsDir } = getConvexConfigFn(sharedDir);
    const lockfilePath = getPluginLockfilePath(functionsDir);
    const lockfile = readPluginLockfile(lockfilePath);
    const schemaPlugins = await resolveSchemaInstalledPlugins(functionsDir);
    const installedPlugins = [
      ...new Set([
        ...(Object.keys(lockfile.plugins).filter((key) =>
          isSupportedPluginKey(key)
        ) as SupportedPlugin[]),
        ...schemaPlugins,
      ]),
    ].sort((a, b) => a.localeCompare(b));
    const pluginMetadata = installedPlugins.map((plugin) => {
      const descriptor = getPluginDescriptor(plugin);
      const lockfileEntry = lockfile.plugins[plugin];
      return {
        key: plugin,
        package: lockfileEntry?.package ?? descriptor.packageName,
        files: lockfileEntry?.files ?? {},
        defaultPreset: descriptor.defaultPreset ?? null,
        presets: descriptor.presets.map((profile) => ({
          key: profile.key,
          description: profile.description,
        })),
      };
    });
    const payload = {
      installedPlugins,
      schemaPlugins,
      plugins: pluginMetadata,
      lockfilePath: normalizePath(relative(process.cwd(), lockfilePath)),
    };
    if (listArgs.json) {
      console.info(JSON.stringify(payload));
    } else if (pluginMetadata.length === 0) {
      console.info('No plugins installed.');
    } else {
      const lines = pluginMetadata.map((plugin) => {
        const presetKeys = plugin.presets
          .map((preset) => preset.key)
          .join(', ');
        const presetSummary =
          presetKeys.length > 0
            ? `presets: ${presetKeys}${plugin.defaultPreset ? ` (default: ${plugin.defaultPreset})` : ''}`
            : 'presets: none';
        return `  - ${plugin.key} (${presetSummary})`;
      });
      console.info(`Installed plugins:\n${lines.join('\n')}`);
    }
    return 0;
  }
  if (command === 'codegen') {
    const config = loadBetterConvexConfigFn(configPath);
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
        additionalConvexArgs: convexArgs,
      });
    }
    return runConfiguredCodegen({
      config,
      sharedDir,
      debug,
      generateMetaFn,
      execaFn,
      realConvexPath,
      additionalConvexArgs: convexArgs,
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
    // Pass through to convex env (list, get, set, remove)
    const result = await execaFn(
      'node',
      [realConvexPath, 'env', ...convexArgs],
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

    const config = loadBetterConvexConfigFn(configPath);
    const resetArgs = [...config.deploy.args, ...resetCommandArgs];
    const deploymentArgs = extractRunDeploymentArgs(resetArgs);

    const runOptionalHook = async (functionName: string | undefined) => {
      if (!functionName) {
        return 0;
      }
      const result = await runConvexFunction(
        execaFn,
        realConvexPath,
        functionName,
        {},
        deploymentArgs
      );
      return result.exitCode;
    };

    const beforeExitCode = await runOptionalHook(beforeHook);
    if (beforeExitCode !== 0) {
      return beforeExitCode;
    }

    const resetResult = await runConvexFunction(
      execaFn,
      realConvexPath,
      'generated/server:reset',
      {},
      deploymentArgs
    );
    if (resetResult.exitCode !== 0) {
      return resetResult.exitCode;
    }

    const backfillExitCode = await runAggregateBackfillFlow({
      execaFn,
      realConvexPath,
      backfillConfig: {
        enabled: 'on',
        wait: true,
        batchSize: 1000,
        pollIntervalMs: 1000,
        timeoutMs: 900_000,
        strict: false,
      },
      mode: 'resume',
      deploymentArgs,
      context: 'aggregate',
    });
    if (backfillExitCode !== 0) {
      return backfillExitCode;
    }

    return runOptionalHook(afterHook);
  }
  if (command === 'deploy') {
    const config = loadBetterConvexConfigFn(configPath);
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
      'node',
      [realConvexPath, 'deploy', ...deployArgs],
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
    const deploymentArgs = extractRunDeploymentArgs(deployArgs);

    const migrationExitCode = await runMigrationFlow({
      execaFn,
      realConvexPath,
      migrationConfig,
      deploymentArgs,
      context: 'deploy',
      direction: 'up',
    });
    if (migrationExitCode !== 0) {
      return migrationExitCode;
    }

    return runAggregateBackfillFlow({
      execaFn,
      realConvexPath,
      backfillConfig,
      mode: 'resume',
      deploymentArgs,
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

    const config = loadBetterConvexConfigFn(configPath);

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
    const deploymentArgs = extractRunDeploymentArgs(commandArgs);

    if (subcommand === 'up') {
      return runMigrationFlow({
        execaFn,
        realConvexPath,
        migrationConfig,
        deploymentArgs,
        context: 'migration',
        direction: 'up',
      });
    }

    if (subcommand === 'down') {
      const { remainingArgs, steps, to } =
        extractMigrationDownOptions(commandArgs);
      const downDeploymentArgs = extractRunDeploymentArgs(remainingArgs);
      return runMigrationFlow({
        execaFn,
        realConvexPath,
        migrationConfig,
        deploymentArgs: downDeploymentArgs,
        context: 'migration',
        direction: 'down',
        steps,
        to,
      });
    }

    if (subcommand === 'status') {
      const statusResult = await runConvexFunction(
        execaFn,
        realConvexPath,
        'generated/server:migrationStatus',
        {},
        deploymentArgs
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
    const cancelDeploymentArgs = extractRunDeploymentArgs(cancelArgs);
    const cancelResult = await runConvexFunction(
      execaFn,
      realConvexPath,
      'generated/server:migrationCancel',
      runId ? { runId } : {},
      cancelDeploymentArgs
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

    const config = loadBetterConvexConfigFn(configPath);
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
    const deploymentArgs = extractRunDeploymentArgs(aggregateArgs);
    if (subcommand === 'prune') {
      return runAggregatePruneFlow({
        execaFn,
        realConvexPath,
        deploymentArgs,
      });
    }

    return runAggregateBackfillFlow({
      execaFn,
      realConvexPath,
      backfillConfig,
      mode: subcommand === 'rebuild' ? 'rebuild' : 'resume',
      deploymentArgs,
      context: 'aggregate',
    });
  }
  // Pass through to real convex CLI
  const result = await execaFn(
    'node',
    [realConvexPath, command, ...convexArgs],
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

// Only run when executed directly (not when imported for tests).
const isMain = isEntryPoint(process.argv[1], __filename);

if (isMain) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      cleanup();
      console.error('Error:', error);
      process.exit(1);
    }
  );
}
