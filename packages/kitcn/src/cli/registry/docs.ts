import type { CliDocEntry } from '../types.js';
import { getPluginCatalogEntry, isSupportedPluginKey } from './index.js';

export const resolvePluginDocTopic = (
  topic: string
): CliDocEntry | undefined => {
  if (!isSupportedPluginKey(topic)) {
    return undefined;
  }
  const descriptor = getPluginCatalogEntry(topic);
  return {
    title: descriptor.label,
    localPath: descriptor.docs.localPath,
    publicUrl: descriptor.docs.publicUrl,
    keywords: descriptor.keywords,
  };
};
