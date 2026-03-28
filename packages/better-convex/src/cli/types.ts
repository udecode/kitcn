import type { ProjectScaffoldContext } from './project-context.js';
import type {
  PluginCatalogEntry,
  PluginScaffoldTarget,
  SupportedPluginKey,
} from './registry/types.js';

export type SupportedPlugin = SupportedPluginKey;

export type PluginDescriptor = PluginCatalogEntry;

export type PluginEnvReminder = {
  key: string;
  path: string;
  message?: string;
};

export type PluginDependencyInstallResult = {
  packageName?: string;
  packageSpec?: string;
  packageJsonPath?: string;
  installed: boolean;
  skipped: boolean;
  reason?:
    | 'missing_package_json'
    | 'already_present'
    | 'dry_run'
    | 'scoped_apply';
};

export type PluginApplyScope = 'schema';
export type PluginLiveBootstrapTarget = 'local';

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
  | 'live_bootstrap'
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
  managedBaselineContent?: string | readonly string[];
  requiresExplicitOverwrite?: boolean;
  manualActions?: string[];
  schemaOwnershipLock?: PluginRootSchemaOwnership | null;
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
  applyScope?: PluginApplyScope;
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

export type CliSelectOption<TValue extends string> = {
  value: TValue;
  label: string;
  hint?: string;
};

export type PromptAdapter = {
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

export type PluginRootSchemaTableOwnership =
  | {
      owner: 'local';
    }
  | {
      checksum: string;
      owner: 'managed';
    };

export type PluginRootSchemaOwnership = {
  path: string;
  tables: Record<string, PluginRootSchemaTableOwnership>;
};

export type PluginLockfileEntry = {
  package: string;
  files?: Record<string, string>;
  schema?: PluginRootSchemaOwnership;
};

export type PluginLockfile = {
  plugins: Record<string, PluginLockfileEntry>;
};

export type ScaffoldTemplate = {
  id: string;
  path: string;
  content: string;
  target: PluginScaffoldTarget;
  requires: string[];
  dependencyHintMessage?: string;
  dependencyHints: string[];
};

export type ResolvedScaffoldRoots = {
  functionsRootDir: string;
  libRootDir: string;
  appRootDir: string | null;
  clientLibRootDir: string | null;
  crpcFilePath: string;
  sharedApiFilePath: string;
  envFilePath: string;
  projectContext: ProjectScaffoldContext | null;
};
