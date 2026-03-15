import type { InternalPluginRegistryItemDefinition } from './types.js';

export function defineInternalRegistryItem<
  TItem extends InternalPluginRegistryItemDefinition,
>(definition: TItem): TItem {
  return definition;
}
