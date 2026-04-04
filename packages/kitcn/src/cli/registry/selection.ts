import { join, relative } from 'node:path';
import { isCancel } from '@clack/prompts';
import type {
  PlanSelectionSource,
  PluginDescriptor,
  PromptAdapter,
  ResolvedScaffoldRoots,
  ScaffoldTemplate,
  SupportedPlugin,
} from '../types.js';
import { getPluginCatalogEntry } from './index.js';
import { normalizePath, normalizeRelativePathOrThrow } from './path-utils.js';

const getPluginDisplayHint = (
  descriptor: PluginDescriptor
): string | undefined => descriptor.presets[0]?.description;

const normalizeTemplateIdOrThrow = (templateId: string, fieldName: string) => {
  const normalized = templateId.trim();
  if (normalized.length === 0) {
    throw new Error(`Invalid ${fieldName}: template id must be non-empty.`);
  }
  return normalized;
};

export const resolvePluginPreset = async (
  descriptor: PluginDescriptor,
  promptAdapter: PromptAdapter,
  presetArg?: string
): Promise<string> => {
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
};

export const promptForPluginSelection = async (
  promptAdapter: PromptAdapter,
  plugins: readonly SupportedPlugin[],
  message: string
): Promise<SupportedPlugin> => {
  const options = plugins.map((plugin) => {
    const descriptor = getPluginCatalogEntry(plugin);
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
};

export const collectPluginScaffoldTemplates = (
  descriptor: PluginDescriptor
): ScaffoldTemplate[] => {
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
      target: template.target,
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
};

export const resolvePresetScaffoldTemplates = (
  descriptor: PluginDescriptor,
  preset: string
): ScaffoldTemplate[] => {
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
};

const resolveTemplateSelectionWithDependencies = (
  descriptor: PluginDescriptor,
  allTemplates: readonly ScaffoldTemplate[],
  templateIds: readonly string[],
  errorContext: string
): ScaffoldTemplate[] => {
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
};

export const resolveTemplatesByIdOrThrow = (
  descriptor: PluginDescriptor,
  allTemplates: readonly ScaffoldTemplate[],
  templateIds: readonly string[],
  errorContext: string
): ScaffoldTemplate[] =>
  resolveTemplateSelectionWithDependencies(
    descriptor,
    allTemplates,
    templateIds,
    errorContext
  );

export const filterScaffoldTemplatePathMap = (
  templatePathMap: Record<string, string>,
  allowedTemplateIds: readonly string[]
): Record<string, string> => {
  if (allowedTemplateIds.length === 0) {
    return {};
  }
  const allowed = new Set(allowedTemplateIds.map((templateId) => templateId));
  return Object.fromEntries(
    Object.entries(templatePathMap).filter(([templateId]) =>
      allowed.has(templateId)
    )
  );
};

export const resolveAddTemplateDefaults = (params: {
  presetArg?: string;
  lockfileTemplateIds: readonly string[];
  presetTemplateIds: readonly string[];
  availableTemplateIds: readonly string[];
}): string[] => {
  const availableTemplateIdSet = new Set(
    params.availableTemplateIds.map((id) => id.trim())
  );
  const normalizeTemplateIds = (templateIds: readonly string[]) =>
    [...new Set(templateIds.map((id) => id.trim()))].filter(
      (id) => id.length > 0 && availableTemplateIdSet.has(id)
    );
  const lockfileTemplateIds = normalizeTemplateIds(params.lockfileTemplateIds);
  const presetTemplateIds = normalizeTemplateIds(params.presetTemplateIds);
  return typeof params.presetArg === 'string'
    ? presetTemplateIds
    : lockfileTemplateIds.length > 0
      ? lockfileTemplateIds
      : presetTemplateIds;
};

export const promptForScaffoldTemplateSelection = async (
  promptAdapter: PromptAdapter,
  descriptor: PluginDescriptor,
  selectableTemplates: readonly ScaffoldTemplate[],
  initialTemplateIds: readonly string[],
  roots: ResolvedScaffoldRoots
): Promise<string[]> => {
  const resolveTemplateRootDir = (template: ScaffoldTemplate) => {
    if (template.target === 'lib') {
      return roots.libRootDir;
    }
    if (template.target === 'app') {
      return roots.appRootDir ?? roots.functionsRootDir;
    }
    if (template.target === 'client-lib') {
      return roots.clientLibRootDir ?? roots.functionsRootDir;
    }
    return roots.functionsRootDir;
  };

  const resolveTemplateLabel = (template: ScaffoldTemplate) =>
    normalizePath(
      relative(
        process.cwd(),
        join(resolveTemplateRootDir(template), template.path)
      )
    );

  const preferredTemplateIds = new Set(
    initialTemplateIds
      .map((templateId) => templateId.trim())
      .filter((templateId) => templateId.length > 0)
  );
  const optionsByLabel = new Map<string, ScaffoldTemplate>();
  for (const template of selectableTemplates) {
    const label = resolveTemplateLabel(template);
    const existing = optionsByLabel.get(label);
    if (!existing) {
      optionsByLabel.set(label, template);
      continue;
    }

    const existingPreferred = preferredTemplateIds.has(existing.id);
    const nextPreferred = preferredTemplateIds.has(template.id);
    if (nextPreferred && !existingPreferred) {
      optionsByLabel.set(label, template);
    }
  }

  const optionTemplateById = new Map(
    [...optionsByLabel.values()].map(
      (template) => [template.id, template] as const
    )
  );
  const templateById = new Map(
    selectableTemplates.map((template) => [template.id, template] as const)
  );
  const normalizedInitialTemplateIds = [
    ...new Set(
      initialTemplateIds.flatMap((templateId) => {
        const template = templateById.get(templateId.trim());
        if (!template) {
          return [];
        }
        const selectedTemplate = optionsByLabel.get(
          resolveTemplateLabel(template)
        );
        return selectedTemplate ? [selectedTemplate.id] : [];
      })
    ),
  ].filter((templateId) => optionTemplateById.has(templateId));

  const selected = await promptAdapter.multiselect({
    message: `Select scaffold files for plugin "${descriptor.key}". Space to toggle. Enter to submit.`,
    options: [...optionsByLabel.entries()].map(([label, template]) => ({
      value: template.id,
      label,
    })),
    initialValues: normalizedInitialTemplateIds,
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
};

export const resolveTemplateSelectionSource = (params: {
  presetArg?: string;
  lockfileTemplateIds: readonly string[];
}): PlanSelectionSource =>
  typeof params.presetArg === 'string'
    ? 'preset'
    : params.lockfileTemplateIds.length > 0
      ? 'lockfile'
      : 'preset';
