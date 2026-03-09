import type {
  PluginCatalogEntry,
  SupportedPluginKey,
} from './plugin-catalog.js';

export type SupportedPlugin = SupportedPluginKey;

export type PluginDescriptor = PluginCatalogEntry;

export type PluginEnvReminder = {
  key: string;
  path: string;
  message?: string;
};

export type PluginDependencyInstallResult = {
  packageName?: string;
  packageJsonPath?: string;
  installed: boolean;
  skipped: boolean;
  reason?: 'missing_package_json' | 'already_present' | 'dry_run';
};

export type PlanSelectionSource = 'preset' | 'lockfile';
export type PlanFileKind =
  | 'config'
  | 'env'
  | 'schema'
  | 'lockfile'
  | 'scaffold';
export type PlanFileAction = 'create' | 'update' | 'skip';
export type PlanOperationKind =
  | 'dependency_install'
  | 'codegen'
  | 'post_add_hook'
  | 'env_reminder';
export type PlanOperationStatus = 'pending' | 'skipped' | 'applied';

export type PluginInstallPlanFile = {
  kind: PlanFileKind;
  templateId?: string;
  path: string;
  action: PlanFileAction;
  reason: string;
  content: string;
  existingContent?: string;
};

export type PluginInstallPlanOperation = {
  kind: PlanOperationKind;
  status: PlanOperationStatus;
  reason: string;
  path?: string;
  packageName?: string;
  command?: string;
  key?: string;
  message?: string;
};

export type PluginInstallPlan = {
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

export type InstalledPluginState = {
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

export type CliDocEntry = {
  title: string;
  localPath: string;
  publicUrl?: string;
  keywords?: readonly string[];
};
