import fs from 'node:fs';
import path from 'node:path';
import { createJiti } from 'jiti';

type JitiExportTarget =
  | string
  | { [key: string]: JitiExportTarget }
  | JitiExportTarget[];

const JITI_EXPORT_CONDITION_PRIORITY = [
  'bun',
  'import',
  'module',
  'default',
  'require',
] as const;

const SERVER_PARSER_SHIM_SOURCE = `const createProcedureBuilder = () => {
  const builder = {
    internal() {
      return builder;
    },
    use() {
      return builder;
    },
    meta() {
      return builder;
    },
    input() {
      return builder;
    },
    output() {
      return builder;
    },
    query(handler) {
      return {
        _crpcMeta: { type: "query" },
        _handler: handler,
      };
    },
    mutation(handler) {
      return {
        _crpcMeta: { type: "mutation" },
        _handler: handler,
      };
    },
    action(handler) {
      return {
        _crpcMeta: { type: "action" },
        _handler: handler,
      };
    },
  };

  return builder;
};

export const initCRPC = {
  meta() {
    return this;
  },
  dataModel() {
    return this;
  },
  context() {
    return this;
  },
  create() {
    return {
      query: createProcedureBuilder(),
      mutation: createProcedureBuilder(),
      action: createProcedureBuilder(),
      httpAction: createProcedureBuilder(),
      router: (record = {}) => record,
    };
  },
};

export class CRPCError extends Error {
  constructor(options = {}) {
    super(options.message ?? options.code ?? "CRPC error");
    this.code = options.code;
  }
}

export const createEnv = ({ schema }) => ({ schema });
export const createHttpRouter = (_app, httpRouter) => httpRouter ?? {};
export const createCallerFactory = () => () => ({});
export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
  const meta = maybeMeta ?? pathOrMeta;
  const fn = Array.isArray(pathOrMeta)
    ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
    : fnOrRoot;
  return Object.assign(fn ?? {}, meta ?? {}, { functionRef: fn });
};
export const createGeneratedFunctionReference = (name) => ({
  [Symbol.for("functionName")]: name,
});
export const typedProcedureResolver = (_functionRef, resolver) => resolver;
export const createGeneratedRegistryRuntime = () => ({
  getCallerFactory() {
    return () => ({});
  },
  getHandlerFactory() {
    return () => ({});
  },
});
`;

const resolveJitiExportTarget = (target: unknown): string | null => {
  if (typeof target === 'string') {
    return target;
  }
  if (Array.isArray(target)) {
    for (const entry of target) {
      const resolved = resolveJitiExportTarget(entry);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }
  if (!target || typeof target !== 'object') {
    return null;
  }

  const record = target as Record<string, JitiExportTarget>;
  for (const condition of JITI_EXPORT_CONDITION_PRIORITY) {
    const resolved = resolveJitiExportTarget(record[condition]);
    if (resolved) {
      return resolved;
    }
  }
  for (const value of Object.values(record)) {
    const resolved = resolveJitiExportTarget(value);
    if (resolved) {
      return resolved;
    }
  }
  return null;
};

const buildLocalPackageExportAliases = (
  cwd: string,
  packageName: string
): Record<string, string> => {
  const packageDir = path.join(cwd, 'node_modules', ...packageName.split('/'));
  const packageJsonPath = path.join(packageDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return {};
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    exports?: Record<string, JitiExportTarget> | JitiExportTarget;
  };
  const exportsField = packageJson.exports;
  if (
    !exportsField ||
    typeof exportsField !== 'object' ||
    Array.isArray(exportsField)
  ) {
    return {};
  }

  const aliases: Record<string, string> = {};
  for (const [exportKey, exportTarget] of Object.entries(exportsField)) {
    const resolvedTarget = resolveJitiExportTarget(exportTarget);
    if (!resolvedTarget || !resolvedTarget.startsWith('./')) {
      continue;
    }

    const specifier =
      exportKey === '.'
        ? packageName
        : exportKey.startsWith('./')
          ? `${packageName}${exportKey.slice(1)}`
          : null;
    if (!specifier) {
      continue;
    }

    aliases[specifier] = path.join(packageDir, resolvedTarget);
  }

  return aliases;
};

const ensureServerParserShim = (cwd: string): string => {
  const shimDir = path.join(cwd, 'node_modules', '.kitcn');
  const shimPath = path.join(shimDir, 'project-jiti-server-shim.mjs');
  fs.mkdirSync(shimDir, { recursive: true });
  if (
    !fs.existsSync(shimPath) ||
    fs.readFileSync(shimPath, 'utf8') !== SERVER_PARSER_SHIM_SOURCE
  ) {
    fs.writeFileSync(shimPath, SERVER_PARSER_SHIM_SOURCE, 'utf8');
  }
  return shimPath;
};

export const createProjectJiti = (cwd = process.cwd()) =>
  createJiti(cwd, {
    interopDefault: true,
    moduleCache: false,
    alias: {
      ...buildLocalPackageExportAliases(cwd, 'kitcn'),
      ...buildLocalPackageExportAliases(cwd, 'convex'),
      'kitcn/server': ensureServerParserShim(cwd),
    },
  });
