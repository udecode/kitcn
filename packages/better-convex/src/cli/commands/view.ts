import { parseArgs, type RunDeps, resolveRunDeps } from '../backend-core.js';
import {
  getPluginCatalogEntry,
  getSupportedPluginKeys,
  isSupportedPluginKey,
} from '../registry/index.js';
import { buildPluginInstallPlan } from '../registry/planner.js';
import {
  collectPluginScaffoldTemplates,
  filterScaffoldTemplatePathMap,
  promptForPluginSelection,
  resolvePluginPreset,
  resolvePresetScaffoldTemplates,
  resolveTemplateSelectionSource,
  resolveTemplatesByIdOrThrow,
} from '../registry/selection.js';
import {
  assertSchemaFileExists,
  collectInstalledPluginKeys,
  getPluginLockfilePath,
  readPluginLockfile,
  resolveSchemaInstalledPlugins,
} from '../registry/state.js';
import { serializeDryRunPlan } from '../utils/dry-run.js';
import { formatPluginView } from '../utils/dry-run-formatter.js';
import { logger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';

const HELP_FLAGS = new Set(['--help', '-h']);

export const VIEW_HELP_TEXT = `Usage: better-convex view [plugin] [options]

Options:
  --json            Machine-readable command output
  --preset, -p      Plugin preset override`;

export const parseViewCommandArgs = (args: string[]) => {
  const first = args[0];
  const plugin =
    first && !first.startsWith('-')
      ? isSupportedPluginKey(first)
        ? first
        : (() => {
            throw new Error(
              `Unsupported plugin "${first}". Supported plugins: ${getSupportedPluginKeys().join(', ')}.`
            );
          })()
      : undefined;
  let index = plugin ? 1 : 0;
  let json = false;
  let preset: string | undefined;

  for (; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      json = true;
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
    throw new Error(`Unknown view flag "${arg}".`);
  }

  return {
    plugin,
    json,
    preset,
  };
};

export const handleViewCommand = async (
  argv: string[],
  deps: Partial<RunDeps> = {}
) => {
  const parsed = parseArgs(argv);
  if (
    HELP_FLAGS.has(argv[0] ?? '') ||
    HELP_FLAGS.has(parsed.restArgs[0] ?? '')
  ) {
    logger.write(VIEW_HELP_TEXT);
    return 0;
  }

  const viewArgs = parseViewCommandArgs(parsed.restArgs);
  const {
    getConvexConfig: getConvexConfigFn,
    loadBetterConvexConfig: loadBetterConvexConfigFn,
    promptAdapter,
  } = resolveRunDeps(deps);
  const viewSpinner = createSpinner('Resolving plugin view...', {
    silent: viewArgs.json,
  });
  const config = loadBetterConvexConfigFn(parsed.configPath);
  const sharedDir = parsed.sharedDir ?? config.paths.shared;
  const { functionsDir } = getConvexConfigFn(sharedDir);
  assertSchemaFileExists(functionsDir);

  viewSpinner.start();
  const lockfile = readPluginLockfile(getPluginLockfilePath(functionsDir));
  const schemaPlugins = await resolveSchemaInstalledPlugins(functionsDir);
  const installedPlugins = collectInstalledPluginKeys(lockfile, schemaPlugins);
  const selectedPlugin =
    viewArgs.plugin ??
    (promptAdapter.isInteractive()
      ? await promptForPluginSelection(
          promptAdapter,
          installedPlugins.length > 0
            ? installedPlugins
            : [...getSupportedPluginKeys()].sort((a, b) => a.localeCompare(b)),
          'Select a plugin to inspect'
        )
      : undefined);

  if (!selectedPlugin) {
    throw new Error('Missing plugin name. Usage: better-convex view [plugin].');
  }

  const pluginDescriptor = getPluginCatalogEntry(selectedPlugin);
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
    configPathArg: parsed.configPath,
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
        ...serializeDryRunPlan(plan),
      })
    );
  } else {
    logger.write(formatPluginView(plan));
  }

  return 0;
};
