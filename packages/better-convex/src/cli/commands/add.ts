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
import { applyPluginDependencyInstall } from '../registry/dependencies.js';
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
import { serializeDryRunPlan } from '../utils/dry-run.js';
import {
  formatPlanDiff,
  formatPlanSummary,
  formatPlanView,
} from '../utils/dry-run-formatter.js';
import { logger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';

const HELP_FLAGS = new Set(['--help', '-h']);

export const ADD_HELP_TEXT = `Usage: better-convex add [plugin] [options]

Options:
  --yes, -y         Deterministic non-interactive mode
  --json            Machine-readable command output
  --dry-run         Show planned operations without writing files
  --diff [path]     Show unified diffs for planned file changes
  --view [path]     Show planned file contents
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
    if (arg === '--no-codegen') {
      noCodegen = true;
      continue;
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
};

export const handleAddCommand = async (
  argv: string[],
  deps: Partial<RunDeps> = {}
) => {
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
    realConvex: realConvexPath,
    realConcave: realConcavePath,
  } = resolveRunDeps(deps);
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

  dryRunSpinner.start();
  const pluginDescriptor = getPluginCatalogEntry(selectedPlugin);
  const initializationPlan = isBetterConvexInitialized({
    functionsDir,
    config,
  })
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
    configPathArg: parsed.configPath,
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
      if (!addArgs.overwrite) {
        logger.info('Re-run with --overwrite to replace changed files.');
      }
    }
    if (dependencyInstall.installed) {
      logger.success(
        `Installed ${dependencyInstall.packageSpec ?? dependencyInstall.packageName}.`
      );
    }
    if (plan.dependencyHints.length > 0) {
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
    const codegenExitCode = await runConfiguredCodegen({
      config: effectiveConfig,
      sharedDir: effectiveSharedDir,
      debug: parsed.debug || effectiveConfig.codegen.debug,
      generateMetaFn,
      execaFn,
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
