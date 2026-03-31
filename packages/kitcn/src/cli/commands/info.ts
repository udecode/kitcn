import fs from 'node:fs';
import { relative, resolve } from 'node:path';
import {
  formatInfoOutput as formatInfoOutputFn,
  parseArgs,
  type RunDeps,
  readPackageVersions,
  resolveConfiguredBackend,
  resolveRunDeps,
} from '../backend-core.js';
import { inspectPluginDependencyInstall } from '../registry/dependencies.js';
import {
  getPluginCatalogEntry,
  isSupportedPluginKey,
} from '../registry/index.js';
import { buildPluginInstallPlan } from '../registry/planner.js';
import {
  collectPluginScaffoldTemplates,
  filterScaffoldTemplatePathMap,
  resolvePresetScaffoldTemplates,
  resolveTemplateSelectionSource,
  resolveTemplatesByIdOrThrow,
} from '../registry/selection.js';
import {
  collectInstalledPluginKeys,
  getPluginLockfilePath,
  getSchemaFilePath,
  readPluginLockfile,
  resolveSchemaInstalledPlugins,
} from '../registry/state.js';
import type { InstalledPluginState } from '../types.js';
import { logger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';

const HELP_FLAGS = new Set(['--help', '-h']);

export { formatInfoOutput } from '../backend-core.js';

export const INFO_HELP_TEXT = `Usage: kitcn info [options]

Options:
  --json            Machine-readable project inspection output`;

export const parseInfoCommandArgs = (args: string[]) => {
  let json = false;
  for (const arg of args) {
    if (arg === '--json') {
      json = true;
      continue;
    }
    throw new Error(`Unknown info flag "${arg}".`);
  }
  return { json };
};

export const handleInfoCommand = async (
  argv: string[],
  deps: Partial<RunDeps> = {}
) => {
  const parsed = parseArgs(argv);
  if (
    HELP_FLAGS.has(argv[0] ?? '') ||
    HELP_FLAGS.has(parsed.restArgs[0] ?? '')
  ) {
    logger.write(INFO_HELP_TEXT);
    return 0;
  }

  const infoArgs = parseInfoCommandArgs(parsed.restArgs);
  const {
    getConvexConfig: getConvexConfigFn,
    loadCliConfig: loadCliConfigFn,
    promptAdapter,
  } = resolveRunDeps(deps);
  const infoSpinner = createSpinner('Inspecting project...', {
    silent: infoArgs.json,
  });
  infoSpinner.start();
  const config = loadCliConfigFn(parsed.configPath);
  const backend = resolveConfiguredBackend({
    backendArg: parsed.backend,
    config,
  });
  const sharedDir = parsed.sharedDir ?? config.paths.shared;
  const { functionsDir } = getConvexConfigFn(sharedDir);
  const schemaPath = getSchemaFilePath(functionsDir);
  const lockfilePath = getPluginLockfilePath(functionsDir);
  const lockfile = readPluginLockfile(lockfilePath);
  const schemaExists = fs.existsSync(schemaPath);
  const schemaPlugins = schemaExists
    ? await resolveSchemaInstalledPlugins(functionsDir)
    : [];
  const installedPlugins = collectInstalledPluginKeys(lockfile, schemaPlugins);
  const versions = readPackageVersions(process.cwd());
  const pluginStates: InstalledPluginState[] = [];

  for (const plugin of installedPlugins) {
    const descriptor = getPluginCatalogEntry(plugin);
    const allTemplates = collectPluginScaffoldTemplates(descriptor);
    const existingTemplatePathMap = filterScaffoldTemplatePathMap(
      lockfile.plugins[plugin]?.files ?? {},
      allTemplates.map((template) => template.id)
    );
    const existingTemplateIds = Object.keys(existingTemplatePathMap);
    const preset = descriptor.defaultPreset ?? descriptor.presets[0]?.key;
    if (!preset) {
      continue;
    }
    const presetTemplates = resolvePresetScaffoldTemplates(descriptor, preset);
    const presetTemplateIds = presetTemplates.map((template) => template.id);
    const selectionSource = resolveTemplateSelectionSource({
      lockfileTemplateIds: existingTemplateIds,
    });
    const selectedTemplateIds =
      selectionSource === 'lockfile' ? existingTemplateIds : presetTemplateIds;
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
          configPathArg: parsed.configPath,
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
    .filter((plugin) => !schemaPlugins.includes(plugin as never));
  const normalizeRelativePath = (value: string) =>
    relative(process.cwd(), resolve(value)).replaceAll('\\', '/') || '.';
  const payload = {
    schemaPlugins,
    installedPlugins: pluginStates,
    project: {
      backend,
      functionsDir: normalizeRelativePath(functionsDir),
      schemaPath: normalizeRelativePath(schemaPath),
      schemaExists,
      lockfilePath: normalizeRelativePath(lockfilePath),
      lockfileExists: fs.existsSync(lockfilePath),
      packageJsonPath: versions.packageJsonPath
        ? normalizeRelativePath(versions.packageJsonPath)
        : undefined,
      kitcnVersion: versions.kitcnVersion,
      convexVersion: versions.convexVersion,
      configPath: (parsed.configPath ?? 'kitcn.json').replaceAll('\\', '/'),
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
    logger.write(formatInfoOutputFn(payload as never));
  }

  return 0;
};
