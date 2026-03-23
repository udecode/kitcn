import type { BetterConvexConfig } from '../config.js';
import type {
  PluginInstallPlanFile,
  ResolvedScaffoldRoots,
  ScaffoldTemplate,
} from '../types.js';

export const SUPPORTED_PLUGIN_KEYS = ['auth', 'resend', 'ratelimit'] as const;
export type SupportedPluginKey = (typeof SUPPORTED_PLUGIN_KEYS)[number];

export type PluginScaffoldTarget = 'functions' | 'lib' | 'app' | 'client-lib';

export type PluginScaffoldTemplate = {
  id: string;
  path: string;
  target: PluginScaffoldTarget;
  content: string;
  requires?: readonly string[];
  dependencyHintMessage?: string;
  dependencyHints?: readonly string[];
};

export type PluginPreset = {
  key: string;
  description: string;
  templateIds: readonly string[];
};

export type PluginEnvField = {
  bootstrap?:
    | {
        kind: 'generated-secret';
      }
    | {
        kind: 'value';
        value: string;
      };
  key: string;
  schema: string;
  reminder?: {
    message?: string;
  };
};

export type PluginSchemaRegistration = {
  importName: string;
  path: string;
  target: 'functions' | 'lib';
};

export type PluginRegistryResolveScaffoldRootsParams = {
  config: BetterConvexConfig;
  functionsDir: string;
  preset: string;
  roots: ResolvedScaffoldRoots;
};

export type PluginRegistryResolveTemplatesParams =
  PluginRegistryResolveScaffoldRootsParams & {
    templates: readonly ScaffoldTemplate[];
  };

export type PluginRegistryBuildPlanFilesParams =
  PluginRegistryResolveScaffoldRootsParams;

export type PluginRegistryIntegration = {
  resolveScaffoldRoots?: (
    params: PluginRegistryResolveScaffoldRootsParams
  ) => Partial<ResolvedScaffoldRoots>;
  resolveTemplates?: (
    params: PluginRegistryResolveTemplatesParams
  ) => readonly ScaffoldTemplate[];
  buildPlanFiles?: (
    params: PluginRegistryBuildPlanFilesParams
  ) => readonly PluginInstallPlanFile[];
  buildSchemaRegistrationPlanFile?: (
    params: PluginRegistryBuildPlanFilesParams
  ) => PluginInstallPlanFile | undefined;
};

export type PluginCatalogEntry = {
  key: SupportedPluginKey;
  label: string;
  description: string;
  keywords: readonly string[];
  docs: {
    localPath: string;
    publicUrl: string;
  };
  packageName: string;
  packageInstallSpec?: string;
  envFields?: readonly PluginEnvField[];
  schemaRegistration: PluginSchemaRegistration;
  defaultPreset: string;
  presets: readonly PluginPreset[];
  templates: readonly PluginScaffoldTemplate[];
  integration?: PluginRegistryIntegration;
};

export type InternalPluginRegistryFileMeta = {
  id: string;
  requires?: readonly string[];
  dependencyHintMessage?: string;
  dependencyHints?: readonly string[];
};

export type InternalPluginRegistryFile = {
  path: string;
  content: string;
  type: 'registry:file' | 'registry:lib' | 'registry:page';
  target: PluginScaffoldTarget;
  meta: InternalPluginRegistryFileMeta;
};

export type InternalPluginRegistryPreset = {
  name: string;
  description: string;
  registryDependencies: readonly string[];
};

export type InternalPluginRegistryMeta = {
  localDocsPath: string;
  envFields?: readonly PluginEnvField[];
  schemaRegistration: PluginSchemaRegistration;
  defaultPreset: string;
  presets: readonly InternalPluginRegistryPreset[];
  integration?: PluginRegistryIntegration;
};

export type InternalPluginRegistryItem = {
  name: SupportedPluginKey;
  type: 'registry:item';
  title: string;
  description: string;
  categories: readonly string[];
  docs: string;
  dependencies: readonly string[];
  files: readonly InternalPluginRegistryFile[];
};

export type InternalPluginRegistryItemDefinition = {
  item: InternalPluginRegistryItem;
  internal: InternalPluginRegistryMeta;
};

export type InternalPluginRegistry = {
  name: string;
  homepage: string;
  items: readonly InternalPluginRegistryItemDefinition[];
};
