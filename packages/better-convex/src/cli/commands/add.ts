import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import {
  applyDependencyInstallPlan,
  applyPluginInstallPlanFiles,
  buildInitializationPlan,
  isBetterConvexInitialized,
  parseArgs,
  type RunDeps,
  resolveConfiguredBackend,
  resolveRunDeps,
  runAfterScaffoldScript,
  runConfiguredCodegen,
} from '../backend-core.js';
import { resolveProjectScaffoldContext } from '../project-context.js';
import {
  applyDependencyHintsInstall,
  applyPluginDependencyInstall,
} from '../registry/dependencies.js';
import {
  getPluginCatalogEntry,
  getSupportedPluginKeys,
  isSupportedPluginKey,
} from '../registry/index.js';
import {
  buildPluginInstallPlan,
  resolvePluginScaffoldRoots,
} from '../registry/planner.js';
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
} from '../registry/selection.js';
import {
  getPluginLockfilePath,
  readPluginLockfile,
} from '../registry/state.js';
import type {
  PluginApplyScope,
  PluginInstallPlan,
  PluginInstallPlanOperation,
  ResolvedScaffoldRoots,
  ScaffoldTemplate,
} from '../types.js';
import { serializeDryRunPlan } from '../utils/dry-run.js';
import {
  formatPlanDiff,
  formatPlanSummary,
  formatPlanView,
} from '../utils/dry-run-formatter.js';
import { logger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';
import { runLocalConvexBootstrap } from './dev.js';

const HELP_FLAGS = new Set(['--help', '-h']);
const RAW_CONVEX_AUTH_PRESET = 'convex';
const AUTH_SCHEMA_ONLY_SCOPE = 'schema' as const satisfies PluginApplyScope;
const AUTH_SCHEMA_FLAG = '--schema';
const RAW_CONVEX_AUTH_DEPLOYMENT_ERROR =
  'Raw Convex auth adoption requires an initialized Convex deployment. Run `convex init` first, then re-run `better-convex add auth --preset convex`.';
const AUTH_SCHEMA_ONLY_MISSING_ERROR =
  'Auth schema sync requires the default Better Convex auth scaffold to already exist. If auth is not scaffolded yet, run `better-convex add auth --yes` once.';
const AUTH_SCHEMA_ONLY_RAW_CONVEX_ERROR =
  'Auth schema sync is only supported for the default Better Convex auth scaffold. Re-run `better-convex add auth --preset convex --yes` for raw Convex auth.';
const AUTH_SCHEMA_OVERWRITE_ERROR =
  'Auth schema sync is additive. Do not pass `--overwrite`; use `better-convex add auth --schema --yes`.';

type AddDeps = Partial<RunDeps> & {
  runLocalBootstrap?: typeof runLocalConvexBootstrap;
};

export const ADD_HELP_TEXT = `Usage: better-convex add [plugin] [options]

Options:
  --yes, -y         Deterministic non-interactive mode
  --json            Machine-readable command output
  --dry-run         Show planned operations without writing files
  --diff [path]     Show unified diffs for planned file changes
  --view [path]     Show planned file contents
  --schema          Apply only auth schema sync
  --overwrite       Overwrite existing changed files without prompt
  --no-codegen      Skip automatic codegen after add
  --preset, -p      Plugin preset override`;

export const parseAddCommandArgs = (args: string[]) => {
  const first = args[0];
  const plugin =
    first && !first.startsWith('-') && isSupportedPluginKey(first)
      ? first
      : undefined;
  let index = plugin ? 1 : 0;
  if (first && !first.startsWith('-') && !plugin) {
    throw new Error(
      `Unsupported plugin "${first}". Supported plugins: ${getSupportedPluginKeys().join(', ')}.`
    );
  }

  let yes = false;
  let json = false;
  let dryRun = false;
  let overwrite = false;
  let noCodegen = false;
  let schema = false;
  let preset: string | undefined;
  let diff: string | true | undefined;
  let view: string | true | undefined;

  for (; index < args.length; index += 1) {
    const arg = args[index];
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
      const value = args[index + 1];
      if (value && !value.startsWith('-')) {
        diff = value;
        index += 1;
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
      const value = args[index + 1];
      if (value && !value.startsWith('-')) {
        view = value;
        index += 1;
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
    if (arg === AUTH_SCHEMA_FLAG) {
      schema = true;
      continue;
    }
    if (arg === '--no-codegen') {
      noCodegen = true;
      continue;
    }
    if (arg === '--only') {
      throw new Error('Use `--schema` instead of `--only schema`.');
    }
    if (arg.startsWith('--only=')) {
      throw new Error('Use `--schema` instead of `--only schema`.');
    }
    if (arg === '--preset' || arg === '-p') {
      const value = args[index + 1];
      if (!value) {
        throw new Error('Missing value for --preset.');
      }
      preset = value;
      index += 1;
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

  if (schema && overwrite) {
    throw new Error(AUTH_SCHEMA_OVERWRITE_ERROR);
  }

  return {
    plugin,
    yes,
    json,
    dryRun: dryRun || Boolean(diff) || Boolean(view),
    overwrite,
    noCodegen,
    schema,
    preset,
    diff,
    view,
  };
};

const isRawConvexAuthPreset = (plugin: string, preset: string) =>
  plugin === 'auth' && preset === RAW_CONVEX_AUTH_PRESET;

const hasRawConvexAuthLockfileFiles = (
  files: Record<string, string> | undefined
) =>
  Boolean(
    files &&
      (files['auth-config-convex'] ||
        files['auth-runtime-convex'] ||
        files['auth-schema-convex'])
  );

const hasRawConvexAuthProjectFiles = () => {
  const rawConvexDir = resolve(process.cwd(), 'convex');
  const rawConvexLockfile = readPluginLockfile(
    resolve(rawConvexDir, 'plugins.lock.json')
  );

  return (
    existsSync(resolve(rawConvexDir, 'authSchema.ts')) ||
    existsSync(resolve(rawConvexDir, 'auth.ts')) ||
    hasRawConvexAuthLockfileFiles(rawConvexLockfile.plugins.auth?.files)
  );
};

const resolveScaffoldTemplateFilePath = (
  template: ScaffoldTemplate,
  roots: ResolvedScaffoldRoots
) => {
  let rootDir: string | null;
  if (template.target === 'functions') {
    rootDir = roots.functionsRootDir;
  } else if (template.target === 'lib') {
    rootDir = roots.libRootDir;
  } else if (template.target === 'app') {
    rootDir = roots.appRootDir;
  } else {
    rootDir = roots.clientLibRootDir;
  }

  if (!rootDir) {
    return null;
  }

  return resolve(process.cwd(), join(rootDir, template.path));
};

const hasExistingManagedAuthScaffoldFiles = ({
  roots,
  templates,
}: {
  roots: ResolvedScaffoldRoots;
  templates: readonly ScaffoldTemplate[];
}) =>
  templates.every((template) => {
    const filePath = resolveScaffoldTemplateFilePath(template, roots);
    return Boolean(filePath && existsSync(filePath));
  });

const filterPluginInstallPlanForAddScope = ({
  plan,
  selectedPlugin,
  applyScope,
  lockfilePath,
}: {
  plan: PluginInstallPlan;
  selectedPlugin: string;
  applyScope: PluginApplyScope | undefined;
  lockfilePath: string;
}): PluginInstallPlan => {
  if (!(selectedPlugin === 'auth' && applyScope === AUTH_SCHEMA_ONLY_SCOPE)) {
    return plan;
  }

  const operations: PluginInstallPlanOperation[] = plan.operations.filter(
    (operation) =>
      operation.kind === 'codegen' || operation.kind === 'post_add_hook'
  );

  return {
    ...plan,
    applyScope,
    files: plan.files.filter(
      (file) =>
        file.kind === 'schema' ||
        (file.kind === 'lockfile' && file.path === lockfilePath)
    ),
    operations,
    dependency: {
      ...plan.dependency,
      installed: false,
      skipped: true,
      reason: 'scoped_apply',
    },
    dependencyHints: [],
    envReminders: [],
    nextSteps: [],
  };
};

const readProjectLocalEnv = () => {
  const envLocalPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envLocalPath)) {
    return {} as Record<string, string>;
  }

  return parseEnv(readFileSync(envLocalPath, 'utf8'));
};

const assertRawConvexAuthDeploymentReady = () => {
  const projectContext = resolveProjectScaffoldContext();
  if (!projectContext) {
    throw new Error(RAW_CONVEX_AUTH_DEPLOYMENT_ERROR);
  }
  const localEnv = readProjectLocalEnv();
  const deployment = localEnv.CONVEX_DEPLOYMENT?.trim();
  const convexUrl = localEnv[projectContext.convexUrlEnvKey]?.trim();

  if (!deployment || !convexUrl) {
    throw new Error(RAW_CONVEX_AUTH_DEPLOYMENT_ERROR);
  }
};

export const handleAddCommand = async (argv: string[], deps: AddDeps = {}) => {
  const parsed = parseArgs(argv);
  if (
    HELP_FLAGS.has(argv[0] ?? '') ||
    HELP_FLAGS.has(parsed.restArgs[0] ?? '')
  ) {
    logger.write(ADD_HELP_TEXT);
    return 0;
  }

  const addArgs = parseAddCommandArgs(parsed.restArgs);
  const {
    execa: execaFn,
    generateMeta: generateMetaFn,
    getConvexConfig: getConvexConfigFn,
    loadBetterConvexConfig: loadBetterConvexConfigFn,
    promptAdapter,
    syncEnv: syncEnvFn,
    realConvex: realConvexPath,
    realConcave: realConcavePath,
  } = resolveRunDeps(deps);
  const runLocalBootstrapFn = deps.runLocalBootstrap ?? runLocalConvexBootstrap;
  const dryRunSpinner = createSpinner('Resolving plugin install plan...', {
    silent: addArgs.json || !addArgs.dryRun,
  });
  const config = loadBetterConvexConfigFn(parsed.configPath);
  const sharedDir = parsed.sharedDir ?? config.paths.shared;
  const { functionsDir } = getConvexConfigFn(sharedDir);
  const selectedPlugin =
    addArgs.plugin ??
    (promptAdapter.isInteractive()
      ? await promptForPluginSelection(
          promptAdapter,
          [...getSupportedPluginKeys()].sort((a, b) => a.localeCompare(b)),
          'Select a plugin to add'
        )
      : undefined);

  if (!selectedPlugin) {
    throw new Error('Missing plugin name. Usage: better-convex add [plugin].');
  }
  const applyScope = addArgs.schema ? AUTH_SCHEMA_ONLY_SCOPE : undefined;
  if (addArgs.schema && selectedPlugin !== 'auth') {
    throw new Error('`--schema` is only supported for plugin "auth".');
  }
  if (
    selectedPlugin === 'auth' &&
    addArgs.schema &&
    hasRawConvexAuthProjectFiles()
  ) {
    throw new Error(AUTH_SCHEMA_ONLY_RAW_CONVEX_ERROR);
  }

  dryRunSpinner.start();
  const pluginDescriptor = getPluginCatalogEntry(selectedPlugin);
  const resolvedPreset = await resolvePluginPreset(
    pluginDescriptor,
    promptAdapter,
    addArgs.preset
  );
  const rawConvexAuthPreset = isRawConvexAuthPreset(
    selectedPlugin,
    resolvedPreset
  );
  const shouldSkipInitializationBootstrap = rawConvexAuthPreset;
  const initializationPlan = isBetterConvexInitialized({
    functionsDir,
    config,
  })
    ? null
    : shouldSkipInitializationBootstrap
      ? null
      : buildInitializationPlan({
          config,
          configPathArg: parsed.configPath,
          envFields: pluginDescriptor.envFields ?? [],
        });
  const effectiveConfig = initializationPlan?.config ?? config;
  const effectiveSharedDir = parsed.sharedDir ?? effectiveConfig.paths.shared;
  const effectiveFunctionsDir =
    initializationPlan?.functionsDir ??
    getConvexConfigFn(effectiveSharedDir).functionsDir;
  const effectiveBackend = resolveConfiguredBackend({
    backendArg: parsed.backend,
    config: effectiveConfig,
  });
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
    effectiveConfig,
    resolvedPreset
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
  if (selectedPlugin === 'auth' && addArgs.schema) {
    const authLockEntry = lockfile.plugins.auth;
    if (
      rawConvexAuthPreset ||
      hasRawConvexAuthLockfileFiles(authLockEntry?.files) ||
      existsSync(resolve(effectiveFunctionsDir, 'authSchema.ts'))
    ) {
      throw new Error(AUTH_SCHEMA_ONLY_RAW_CONVEX_ERROR);
    }

    if (
      !authLockEntry?.schema &&
      !hasExistingManagedAuthScaffoldFiles({
        roots: scaffoldRoots,
        templates: selectedTemplates,
      })
    ) {
      throw new Error(AUTH_SCHEMA_ONLY_MISSING_ERROR);
    }
  }
  const plan = filterPluginInstallPlanForAddScope({
    plan: await buildPluginInstallPlan({
      applyScope,
      descriptor: pluginDescriptor,
      selectedPlugin,
      preset: resolvedPreset,
      selectionSource,
      presetTemplateIds,
      selectedTemplateIds,
      selectedTemplates,
      config: effectiveConfig,
      configPathArg: parsed.configPath,
      functionsDir: effectiveFunctionsDir,
      lockfile,
      existingTemplatePathMap,
      noCodegen: addArgs.noCodegen,
      overwrite: addArgs.overwrite,
      preview: addArgs.dryRun,
      promptAdapter,
      yes: addArgs.yes,
      includeEnvBootstrap:
        initializationPlan || shouldSkipInitializationBootstrap
          ? false
          : undefined,
      bootstrapFiles: initializationPlan?.files,
      bootstrapOperations: initializationPlan?.operations,
      liveBootstrapTarget: effectiveBackend === 'convex' ? 'local' : undefined,
    }),
    selectedPlugin,
    applyScope,
    lockfilePath: relative(
      process.cwd(),
      getPluginLockfilePath(effectiveFunctionsDir)
    ).replaceAll('\\', '/'),
  });
  dryRunSpinner.stop();

  if (addArgs.dryRun) {
    if (addArgs.json) {
      console.info(
        JSON.stringify({
          command: 'add',
          dryRun: true,
          ...serializeDryRunPlan(plan),
        })
      );
    } else if (addArgs.diff) {
      logger.write(formatPlanDiff(plan, addArgs.diff));
    } else if (addArgs.view) {
      logger.write(formatPlanView(plan, addArgs.view));
    } else {
      logger.write(formatPlanSummary(plan));
    }
    return 0;
  }

  if (rawConvexAuthPreset) {
    assertRawConvexAuthDeploymentReady();
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
  const installedDependencyHints = await applyDependencyHintsInstall(
    plan.dependencyHints,
    execaFn
  );
  const payload = {
    command: 'add',
    dryRun: false,
    ...serializeDryRunPlan(plan),
    dependency: {
      packageName: dependencyInstall.packageName,
      packageSpec: dependencyInstall.packageSpec,
      packageJsonPath: dependencyInstall.packageJsonPath?.replaceAll('\\', '/'),
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
        `Created files:\n${applyResult.created.map((file) => `  - ${file}`).join('\n')}`
      );
    }
    if (applyResult.updated.length > 0) {
      logger.write(
        `Updated files:\n${applyResult.updated.map((file) => `  - ${file}`).join('\n')}`
      );
    }
    if (applyResult.skipped.length > 0) {
      logger.write(
        `Skipped files:\n${applyResult.skipped.map((file) => `  - ${file}`).join('\n')}`
      );
      if (!addArgs.schema && !addArgs.overwrite) {
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
    if (installedDependencyHints.length > 0) {
      logger.success(
        `Installed scaffold dependencies: ${installedDependencyHints.join(', ')}.`
      );
    } else if (plan.dependencyHints.length > 0) {
      logger.write(
        `Dependencies:\n${plan.dependencyHints.map((hint) => `  - ${hint}`).join('\n')}`
      );
    }
    if (plan.envReminders.length > 0) {
      const remindersByPath = new Map<string, typeof plan.envReminders>();
      for (const reminder of plan.envReminders) {
        remindersByPath.set(reminder.path, [
          ...(remindersByPath.get(reminder.path) ?? []),
          reminder,
        ]);
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
    const codegenConfig = rawConvexAuthPreset
      ? {
          ...effectiveConfig,
          codegen: {
            ...effectiveConfig.codegen,
            scope: 'auth' as const,
          },
        }
      : effectiveConfig;
    const codegenExitCode = await runConfiguredCodegen({
      config: codegenConfig,
      sharedDir: effectiveSharedDir,
      debug: parsed.debug || effectiveConfig.codegen.debug,
      generateMetaFn,
      execaFn,
      syncEnvFn,
      realConvexPath,
      realConcavePath,
      backend: resolveConfiguredBackend({
        backendArg: parsed.backend,
        config: effectiveConfig,
      }),
    });
    if (codegenExitCode !== 0) {
      return codegenExitCode;
    }

    const liveBootstrapOperation = plan.operations.find(
      (operation) =>
        operation.kind === 'live_bootstrap' && operation.status === 'pending'
    );
    if (liveBootstrapOperation) {
      try {
        await syncEnvFn({
          authSyncMode: 'auto',
          force: true,
          sharedDir: effectiveSharedDir,
          targetArgs: [],
        });
      } catch {
        const bootstrapExitCode = await runLocalBootstrapFn({
          authSyncMode: 'auto',
          config: effectiveConfig,
          debug: parsed.debug || effectiveConfig.dev.debug,
          execaFn,
          generateMetaFn,
          realConvexPath,
          realConcavePath,
          sharedDir: effectiveSharedDir,
          skipGenerateMeta: true,
          syncEnvFn,
          targetArgs: [],
        });
        if (bootstrapExitCode !== 0) {
          return bootstrapExitCode;
        }
      }
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
};
