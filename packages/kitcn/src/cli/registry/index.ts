import { getPackageNameFromInstallSpec } from '../supported-dependencies.js';
import { authRegistryItem } from './items/auth/auth-item.js';
import { ratelimitRegistryItem } from './items/ratelimit/ratelimit-item.js';
import { resendRegistryItem } from './items/resend/resend-item.js';
import {
  type InternalPluginRegistry,
  type InternalPluginRegistryFile,
  type InternalPluginRegistryItemDefinition,
  type InternalPluginRegistryPreset,
  type PluginCatalogEntry,
  type PluginPreset,
  type PluginScaffoldTemplate,
  SUPPORTED_PLUGIN_KEYS,
  type SupportedPluginKey,
} from './types.js';

const INTERNAL_PLUGIN_REGISTRY = {
  name: 'kitcn',
  homepage: 'https://kitcn.vercel.app',
  items: [authRegistryItem, resendRegistryItem, ratelimitRegistryItem],
} as const satisfies InternalPluginRegistry;

function toPluginScaffoldTemplate(
  file: InternalPluginRegistryFile
): PluginScaffoldTemplate {
  return {
    id: file.meta.id,
    path: file.path,
    target: file.target,
    content: file.content,
    requires: file.meta.requires,
    dependencyHintMessage: file.meta.dependencyHintMessage,
    dependencyHints: file.meta.dependencyHints,
  };
}

function toPluginPreset(preset: InternalPluginRegistryPreset): PluginPreset {
  return {
    key: preset.name,
    description: preset.description,
    templateIds: preset.registryDependencies,
  };
}

function toPluginCatalogEntry(
  definition: InternalPluginRegistryItemDefinition
): PluginCatalogEntry {
  const { item, internal } = definition;
  const installDependency = item.dependencies[0];
  if (!installDependency) {
    throw new Error(
      `Plugin "${item.name}" must declare at least one dependency spec.`
    );
  }

  return {
    key: item.name,
    label: item.title,
    description: item.description,
    keywords: item.categories,
    docs: {
      localPath: internal.localDocsPath,
      publicUrl: item.docs,
    },
    packageName: getPackageNameFromInstallSpec(installDependency),
    packageInstallSpec: installDependency,
    planningDependencies: internal.planningDependencies,
    envFields: internal.envFields,
    liveBootstrap: internal.liveBootstrap,
    schemaRegistration: internal.schemaRegistration,
    defaultPreset: internal.defaultPreset,
    presets: internal.presets.map(toPluginPreset),
    templates: item.files.map(toPluginScaffoldTemplate),
    integration: internal.integration,
  };
}

const PLUGIN_CATALOG = Object.fromEntries(
  INTERNAL_PLUGIN_REGISTRY.items.map((definition) => {
    return [definition.item.name, toPluginCatalogEntry(definition)];
  })
) as Record<SupportedPluginKey, PluginCatalogEntry>;

export function getPluginCatalogEntry(
  key: SupportedPluginKey
): PluginCatalogEntry {
  return PLUGIN_CATALOG[key];
}

export function getSupportedPluginKeys(): readonly SupportedPluginKey[] {
  return SUPPORTED_PLUGIN_KEYS;
}

export function isSupportedPluginKey(
  value: string
): value is SupportedPluginKey {
  return SUPPORTED_PLUGIN_KEYS.includes(value as SupportedPluginKey);
}

export type {
  PluginCatalogEntry,
  PluginEnvField,
  PluginPreset,
  PluginScaffoldTarget,
  PluginScaffoldTemplate,
  PluginSchemaRegistration,
  SupportedPluginKey,
} from './types.js';
export { SUPPORTED_PLUGIN_KEYS } from './types.js';
