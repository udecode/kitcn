import type {
  InternalPluginRegistryFile,
  PluginScaffoldTarget,
} from './types.js';

export const createRegistryFile = (params: {
  id: string;
  path: string;
  target: PluginScaffoldTarget;
  content: string;
  requires?: readonly string[];
  dependencyHintMessage?: string;
  dependencyHints?: readonly string[];
}): InternalPluginRegistryFile => {
  const type =
    params.target === 'lib'
      ? 'registry:lib'
      : params.target === 'app'
        ? 'registry:page'
        : 'registry:file';
  return {
    path: params.path,
    content: params.content,
    type,
    target: params.target,
    meta: {
      id: params.id,
      requires: params.requires,
      dependencyHintMessage: params.dependencyHintMessage,
      dependencyHints: params.dependencyHints,
    },
  };
};
