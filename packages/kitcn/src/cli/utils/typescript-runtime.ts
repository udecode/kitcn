import { createRequire } from 'node:module';

type TypeScriptModule = typeof import('typescript');

const require = createRequire(import.meta.url);

let cachedTypeScript: TypeScriptModule | null = null;

const loadTypeScript = (): TypeScriptModule => {
  if (cachedTypeScript) {
    return cachedTypeScript;
  }

  const loaded = require('typescript') as
    | TypeScriptModule
    | { default?: TypeScriptModule };
  const resolved = (
    'default' in loaded && loaded.default ? loaded.default : loaded
  ) as TypeScriptModule;
  cachedTypeScript = resolved;
  return resolved;
};

export const createTypeScriptProxy = (): TypeScriptModule =>
  new Proxy({} as TypeScriptModule, {
    get(_target, property) {
      return loadTypeScript()[property as keyof TypeScriptModule];
    },
  });
